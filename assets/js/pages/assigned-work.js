(function () {
  "use strict";

  const Store = window.MasterFlowStore;
  const UI = window.MasterFlowUI;
  const Feedback = window.MasterFlowReceiverFeedback;

  if (!Store || !UI || !UI.layoutReady || !Feedback) return;

  const recommendedSection = document.getElementById("recommendedSection");
  const recommendedList = document.getElementById("recommendedWorkList");
  const teamQueueSection = document.getElementById("teamQueueSection");
  const queueCards = document.getElementById("workCenterQueueCards");
  const workList = document.getElementById("workCenterList");
  const tableBody = document.getElementById("workCenterTableBody");
  const searchInput = document.getElementById("workCenterSearch");
  const queueFilter = document.getElementById("workCenterQueueFilter");
  const viewButtons = Array.from(document.querySelectorAll("[data-work-view]"));
  const ticketDialog = document.getElementById("receiverTicketDialog");

  let currentView = "recommended";
  let currentTicketId = "";

  const viewDefinitions = {
    recommended: {
      title: "Prioritized work",
      description: "MasterFlow ranks active tickets by operational impact, SLA timing, ownership, and readiness."
    },
    mine: {
      title: "My work",
      description: "Active tickets currently assigned to you."
    },
    team: {
      title: "Team work",
      description: "Active tickets in the queues you are authorized to support."
    },
    unassigned: {
      title: "Needs assignment",
      description: "Tickets that cannot progress consistently until someone accepts ownership."
    },
    risk: {
      title: "SLA risk",
      description: "Active tickets that are overdue or due within one hour."
    },
    waiting: {
      title: "Waiting on requester",
      description: "Tickets blocked until an employee provides more information."
    },
    completed: {
      title: "Recently completed",
      description: "Resolved and closed tickets available for reference."
    }
  };

  function bucketFor(ticket) {
    if (Feedback.isClosed(ticket)) return "completed";
    if (String(ticket.priority || "").startsWith("P1")) return "critical";
    if (Feedback.isWaiting(ticket)) return "waiting";
    if (Feedback.isSlaRisk(ticket)) return "risk";
    return "ready";
  }

  function bucketLabel(bucket) {
    const labels = {
      critical: "Critical operations",
      risk: "SLA risk",
      ready: "Ready to work",
      waiting: "Waiting on requester",
      completed: "Completed"
    };
    return labels[bucket] || "Active";
  }

  function bucketBadgeClass(bucket) {
    const classes = {
      critical: "badge-red",
      risk: "badge-amber",
      ready: "badge-teal",
      waiting: "badge-purple",
      completed: "badge-green"
    };
    return classes[bucket] || "badge-gray";
  }

  function minutesUntilDue(ticket) {
    const due = new Date(ticket.slaDueAt).getTime();
    if (!Number.isFinite(due)) return Number.POSITIVE_INFINITY;
    return Math.round((due - Date.now()) / 60000);
  }

  function priorityWeight(priority) {
    const value = String(priority || "");
    if (value.startsWith("P1")) return 100;
    if (value.startsWith("P2")) return 60;
    if (value.startsWith("P3")) return 30;
    if (value.startsWith("P4")) return 10;
    return 20;
  }

  function calculateWorkScore(ticket) {
    if (Feedback.isClosed(ticket)) return 0;

    let score = priorityWeight(ticket.priority);
    const minutes = minutesUntilDue(ticket);
    const analysis = Feedback.analyzeTicket(ticket);

    if (minutes < 0) score += 80;
    else if (minutes <= 15) score += 60;
    else if (minutes <= 60) score += 40;
    else if (minutes <= 240) score += 20;

    if (ticket.status === "Approval required") score += 30;
    if (ticket.status === "Triage") score += 25;
    if (ticket.status === "New") score += 15;
    if (ticket.assignee === Store.CURRENT_USER.name) score += 15;
    if (!ticket.assignee || ticket.assignee === "Unassigned") score += 25;
    if (Feedback.isWaiting(ticket)) score -= 50;
    if (analysis.workReadiness.label === "Ready to work") score += 15;

    return score;
  }

  function priorityReasons(ticket) {
    const reasons = [];
    const minutes = minutesUntilDue(ticket);
    const analysis = Feedback.analyzeTicket(ticket);

    if (String(ticket.priority || "").startsWith("P1")) reasons.push("Critical operational impact");
    if (minutes < 0) reasons.push("SLA is overdue");
    else if (minutes <= 60) reasons.push("SLA due within one hour");
    if (ticket.status === "Approval required") reasons.push("Decision required");
    if (ticket.status === "Triage") reasons.push("Routing must be confirmed");
    if (ticket.assignee === Store.CURRENT_USER.name) reasons.push("Assigned to you");
    if (!ticket.assignee || ticket.assignee === "Unassigned") reasons.push("No owner assigned");
    if (Feedback.isWaiting(ticket)) reasons.push("Blocked by missing information");
    if (analysis.workReadiness.label === "Ready to work") reasons.push("Work-ready on arrival");
    if (!reasons.length) reasons.push("Ready for action");

    return reasons.slice(0, 3);
  }

  function getTickets() {
    return Store.getState().tickets
      .map((ticket) => ({
        ticket,
        bucket: bucketFor(ticket),
        score: calculateWorkScore(ticket)
      }))
      .sort((a, b) => {
        if (Feedback.isClosed(a.ticket) !== Feedback.isClosed(b.ticket)) {
          return Feedback.isClosed(a.ticket) ? 1 : -1;
        }
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.ticket.slaDueAt).getTime() - new Date(b.ticket.slaDueAt).getTime();
      });
  }

  function matchesView(item) {
    const ticket = item.ticket;
    if (currentView === "recommended") return !Feedback.isClosed(ticket);
    if (currentView === "mine") return !Feedback.isClosed(ticket) && ticket.assignee === Store.CURRENT_USER.name;
    if (currentView === "team") return !Feedback.isClosed(ticket);
    if (currentView === "unassigned") return !Feedback.isClosed(ticket) && (!ticket.assignee || ticket.assignee === "Unassigned");
    if (currentView === "risk") return Feedback.isSlaRisk(ticket);
    if (currentView === "waiting") return !Feedback.isClosed(ticket) && Feedback.isWaiting(ticket);
    if (currentView === "completed") return Feedback.isClosed(ticket);
    return true;
  }

  function filteredItems(items) {
    const query = searchInput.value.trim().toLowerCase();
    const selectedQueue = queueFilter.value;

    return items.filter((item) => {
      const ticket = item.ticket;
      const analysis = Feedback.analyzeTicket(ticket);
      const haystack = [
        ticket.number,
        ticket.title,
        ticket.description,
        ticket.category,
        ticket.queue,
        ticket.assignee,
        ticket.requester,
        ticket.status,
        ticket.location,
        analysis.requestedOutcome,
        analysis.suggestedFirstAction
      ].join(" ").toLowerCase();

      return matchesView(item)
        && (selectedQueue === "all" || ticket.queue === selectedQueue)
        && (!query || haystack.includes(query));
    });
  }

  function renderCounts(items) {
    const active = items.filter((item) => !Feedback.isClosed(item.ticket));
    const completed = items.filter((item) => Feedback.isClosed(item.ticket));
    const counts = {
      recommended: active.length,
      mine: active.filter((item) => item.ticket.assignee === Store.CURRENT_USER.name).length,
      team: active.length,
      unassigned: active.filter((item) => !item.ticket.assignee || item.ticket.assignee === "Unassigned").length,
      risk: active.filter((item) => Feedback.isSlaRisk(item.ticket)).length,
      waiting: active.filter((item) => Feedback.isWaiting(item.ticket)).length,
      completed: completed.length
    };

    Object.entries(counts).forEach(([view, count]) => {
      const element = document.getElementById(`count-${view}`);
      if (element) element.textContent = String(count);
    });
  }

  function renderQueueOptions(items) {
    const existing = queueFilter.value;
    const queues = [...new Set(items.map((item) => item.ticket.queue))].sort();
    queueFilter.innerHTML = `<option value="all">All authorized queues</option>${queues
      .map((queue) => `<option value="${UI.escapeHtml(queue)}">${UI.escapeHtml(queue)}</option>`)
      .join("")}`;
    if (["all", ...queues].includes(existing)) queueFilter.value = existing;
  }

  function queueSummary(items) {
    const active = items.filter((item) => !Feedback.isClosed(item.ticket));
    const queues = [...new Set(active.map((item) => item.ticket.queue))];

    return queues.map((name) => {
      const tickets = active.filter((item) => item.ticket.queue === name);
      return {
        name,
        count: tickets.length,
        unassigned: tickets.filter((item) => !item.ticket.assignee || item.ticket.assignee === "Unassigned").length,
        risk: tickets.filter((item) => Feedback.isSlaRisk(item.ticket)).length,
        critical: tickets.filter((item) => String(item.ticket.priority || "").startsWith("P1")).length
      };
    }).sort((a, b) => {
      const aUrgency = a.critical * 100 + a.risk * 10 + a.unassigned;
      const bUrgency = b.critical * 100 + b.risk * 10 + b.unassigned;
      return bUrgency - aUrgency || b.count - a.count;
    });
  }

  function renderQueueCards(items) {
    const summaries = queueSummary(items);
    if (!summaries.length) {
      queueCards.innerHTML = '<div class="empty-state">No active team queues are visible.</div>';
      return;
    }

    queueCards.innerHTML = summaries.map((queue) => {
      const className = queue.critical ? " critical" : queue.risk ? " at-risk" : "";
      const details = [];
      if (queue.critical) details.push(`${queue.critical} critical`);
      if (queue.risk) details.push(`${queue.risk} SLA risk`);
      if (queue.unassigned) details.push(`${queue.unassigned} unassigned`);
      if (!details.length) details.push("No immediate risk");

      return `
        <button class="queue-card${className}" type="button" data-queue-card="${UI.escapeHtml(queue.name)}">
          <h3>${UI.escapeHtml(queue.name)}</h3>
          <div class="queue-number">${queue.count}</div>
          <div class="queue-meta">${UI.escapeHtml(details.join(" · "))}</div>
        </button>
      `;
    }).join("");
  }

  function recommendedMarkup(item, index) {
    const ticket = item.ticket;
    const analysis = Feedback.analyzeTicket(ticket);
    const reasons = priorityReasons(ticket).map((reason) => `<span>${UI.escapeHtml(reason)}</span>`).join("");

    return `
      <article class="work-card work-card-recommended is-${item.bucket}">
        <div class="work-rank" aria-label="Recommended position ${index + 1}">
          <small>Work</small>
          <strong>${index + 1}</strong>
        </div>
        <div class="work-card-main">
          <div class="work-card-topline">
            <span class="badge ${bucketBadgeClass(item.bucket)}">${UI.escapeHtml(bucketLabel(item.bucket))}</span>
            <span class="work-due">${UI.escapeHtml(analysis.dueLabel)}</span>
          </div>
          <button class="work-ticket-title" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">${UI.escapeHtml(ticket.title)}</button>
          <div class="work-ticket-reference">${UI.escapeHtml(ticket.number)} · ${UI.escapeHtml(ticket.queue)}</div>
          <p class="work-impact">${UI.escapeHtml(analysis.scopeImpact)}</p>
          <div class="work-next-action">
            <small>Suggested first action</small>
            <strong>${UI.escapeHtml(analysis.suggestedFirstAction)}</strong>
          </div>
          <div class="work-reason-list">${reasons}</div>
        </div>
        <div class="work-card-actions">
          ${!ticket.assignee || ticket.assignee === "Unassigned"
            ? `<button class="btn btn-primary btn-sm" type="button" data-claim-ticket="${UI.escapeHtml(ticket.id)}">Claim ticket</button>`
            : ""}
          <button class="btn btn-secondary btn-sm" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">Open request</button>
        </div>
      </article>
    `;
  }

  function workCardMarkup(item) {
    const ticket = item.ticket;
    const analysis = Feedback.analyzeTicket(ticket);
    const reasons = priorityReasons(ticket).map((reason) => `<span>${UI.escapeHtml(reason)}</span>`).join("");

    return `
      <article class="work-card is-${item.bucket}">
        <div class="work-card-main">
          <div class="work-card-topline">
            <span class="badge ${bucketBadgeClass(item.bucket)}">${UI.escapeHtml(bucketLabel(item.bucket))}</span>
            <span class="work-due">${UI.escapeHtml(analysis.dueLabel)}</span>
          </div>
          <button class="work-ticket-title" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">${UI.escapeHtml(ticket.title)}</button>
          <div class="work-ticket-reference">${UI.escapeHtml(ticket.number)} · ${UI.escapeHtml(ticket.queue)}</div>
          <div class="work-card-readiness">
            <span class="badge ${analysis.routingReadiness.className}">${UI.escapeHtml(analysis.routingReadiness.label)}</span>
            <span class="badge ${analysis.workReadiness.className}">${UI.escapeHtml(analysis.workReadiness.label)}</span>
          </div>
          <div class="work-next-action compact">
            <small>Next action</small>
            <strong>${UI.escapeHtml(analysis.suggestedFirstAction)}</strong>
          </div>
          <div class="work-meta">
            <span>Owner: <strong>${UI.escapeHtml(ticket.assignee || "Unassigned")}</strong></span>
            <span>Requester: <strong>${UI.escapeHtml(ticket.requester)}</strong></span>
            <span>Priority: <strong>${UI.escapeHtml(analysis.priorityLabel)}</strong></span>
          </div>
          <div class="work-reason-list">${reasons}</div>
        </div>
        <div class="work-card-actions">
          ${!ticket.assignee || ticket.assignee === "Unassigned"
            ? `<button class="btn btn-primary btn-sm" type="button" data-claim-ticket="${UI.escapeHtml(ticket.id)}">Claim ticket</button>`
            : ""}
          <button class="btn btn-secondary btn-sm" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">${Feedback.isClosed(ticket) ? "View" : "Open"}</button>
        </div>
      </article>
    `;
  }

  function renderRecommended(items) {
    const active = items.filter((item) => !Feedback.isClosed(item.ticket));
    const actionable = active.filter((item) => !Feedback.isWaiting(item.ticket));
    const recommended = (actionable.length ? actionable : active).slice(0, 3);
    recommendedList.innerHTML = recommended.length
      ? recommended.map(recommendedMarkup).join("")
      : '<div class="empty-state">No active tickets need attention.</div>';
  }

  function renderWorkList(items) {
    workList.innerHTML = items.length
      ? items.map(workCardMarkup).join("")
      : '<div class="empty-state">No tickets match this view.</div>';
  }

  function renderTable(items) {
    if (!items.length) {
      tableBody.innerHTML = '<tr><td colspan="7"><div class="empty-state">No tickets match this view.</div></td></tr>';
      return;
    }

    tableBody.innerHTML = items.map((item) => {
      const ticket = item.ticket;
      const analysis = Feedback.analyzeTicket(ticket);
      return `
        <tr>
          <td>
            <button class="link-button" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">${UI.escapeHtml(ticket.number)} - ${UI.escapeHtml(ticket.title)}</button>
            <span class="subtext">${UI.escapeHtml(ticket.category)}</span>
          </td>
          <td><span class="badge ${UI.priorityClass(ticket.priority)}">${UI.escapeHtml(analysis.priorityLabel)}</span></td>
          <td><span class="badge ${UI.statusClass(ticket.status)}">${UI.escapeHtml(ticket.status)}</span></td>
          <td>${UI.escapeHtml(ticket.queue)}</td>
          <td>${UI.escapeHtml(ticket.assignee || "Unassigned")}</td>
          <td><strong>${UI.escapeHtml(analysis.dueLabel)}</strong><span class="subtext">${UI.escapeHtml(UI.formatDate(ticket.slaDueAt))}</span></td>
          <td>
            ${!ticket.assignee || ticket.assignee === "Unassigned"
              ? `<button class="btn btn-secondary btn-sm" type="button" data-claim-ticket="${UI.escapeHtml(ticket.id)}">Claim</button>`
              : `<button class="btn btn-ghost btn-sm" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">View</button>`}
          </td>
        </tr>
      `;
    }).join("");
  }

  function updateViewControls() {
    viewButtons.forEach((button) => {
      const active = button.dataset.workView === currentView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const definition = viewDefinitions[currentView];
    document.getElementById("workListTitle").textContent = definition.title;
    document.getElementById("workListDescription").textContent = definition.description;
  }

  function setBadge(element, text, className) {
    element.textContent = text;
    element.className = `badge ${className}`;
  }

  function assigneeNames() {
    const names = Store.getState().tickets
      .map((ticket) => ticket.assignee)
      .filter((name) => name && name !== "Unassigned");
    names.push(Store.CURRENT_USER.name, "Jordan Kim", "Priya Shah", "Megan Delia");
    return [...new Set(names)].sort();
  }

  function renderTimeline(ticket) {
    const history = (ticket.history || []).slice().reverse();
    const container = document.getElementById("receiverTimeline");
    container.innerHTML = history.length
      ? history.map((item) => `
          <article class="receiver-timeline-item">
            <div class="receiver-timeline-dot"></div>
            <div>
              <strong>${UI.escapeHtml(item.text)}</strong>
              <small>${UI.escapeHtml(UI.formatDate(item.at))}</small>
            </div>
          </article>
        `).join("")
      : '<div class="empty-state">No timeline activity has been recorded.</div>';
  }

  function renderReceiverTicket(ticket) {
    currentTicketId = ticket.id;
    const analysis = Feedback.analyzeTicket(ticket);

    document.getElementById("receiverTicketTitle").textContent = `${ticket.number} - ${ticket.title}`;
    document.getElementById("receiverTicketSubtitle").textContent = `${ticket.queue} · ${ticket.status}`;
    setBadge(document.getElementById("receiverStatusBadge"), ticket.status, UI.statusClass(ticket.status));
    setBadge(document.getElementById("receiverRoutingBadge"), analysis.routingReadiness.label, analysis.routingReadiness.className);
    setBadge(document.getElementById("receiverWorkBadge"), analysis.workReadiness.label, analysis.workReadiness.className);

    document.getElementById("receiverBriefHeadline").textContent = analysis.requestedOutcome;
    document.getElementById("receiverBriefSummary").textContent = analysis.suggestedFirstAction;
    document.getElementById("receiverCurrentOwner").textContent = ticket.assignee || "Unassigned";
    document.getElementById("receiverSlaLabel").textContent = analysis.dueLabel;
    document.getElementById("receiverRequestedOutcome").textContent = analysis.requestedOutcome;
    document.getElementById("receiverObservedSituation").textContent = analysis.observedSituation;
    document.getElementById("receiverScopeImpact").textContent = analysis.scopeImpact;
    document.getElementById("receiverSafetyContainment").textContent = analysis.safetyContainment;
    document.getElementById("receiverSuggestedAction").textContent = analysis.suggestedFirstAction;

    document.getElementById("receiverIdentifiers").innerHTML = analysis.identifiers.length
      ? analysis.identifiers.map((item) => `
          <div class="receiver-identifier">
            <small>${UI.escapeHtml(item.label)}</small>
            <strong>${UI.escapeHtml(item.value)}</strong>
          </div>
        `).join("")
      : '<div class="notice notice-warning"><div><strong>No key identifier captured</strong><p>Confirm the location, asset, order, system, or other identifier needed to perform the work.</p></div></div>';

    document.getElementById("receiverInformationGaps").innerHTML = analysis.gaps.length
      ? `<ul class="receiver-gap-list">${analysis.gaps.map((gap) => `<li>${UI.escapeHtml(gap)}</li>`).join("")}</ul>`
      : '<div class="notice notice-success"><div><strong>No blocking information gap detected</strong><p>The ticket contains the core facts needed to begin work.</p></div></div>';

    const assigneeSelect = document.getElementById("receiverAssigneeSelect");
    assigneeSelect.innerHTML = `<option value="Unassigned">Unassigned</option>${assigneeNames()
      .map((name) => `<option value="${UI.escapeHtml(name)}">${UI.escapeHtml(name)}</option>`)
      .join("")}`;
    assigneeSelect.value = ticket.assignee || "Unassigned";

    const closed = Feedback.isClosed(ticket);
    document.getElementById("receiverClaimTicket").hidden = closed || Boolean(ticket.assignee && ticket.assignee !== "Unassigned");
    document.getElementById("receiverAssignTicket").hidden = closed;
    assigneeSelect.disabled = closed;
    document.getElementById("receiverStartWork").hidden = closed || ticket.status === "In progress";
    document.getElementById("receiverRequestInfo").hidden = closed;
    document.getElementById("receiverAddUpdate").hidden = closed;
    document.getElementById("receiverResolveTicket").hidden = closed;
    document.getElementById("receiverReopenTicket").hidden = !closed;
    document.getElementById("receiverActionNote").value = "";

    renderTimeline(ticket);

    const technical = [
      ["Priority", analysis.priorityLabel],
      ["Queue", ticket.queue],
      ["Assignee", ticket.assignee || "Unassigned"],
      ["Requester", ticket.requester],
      ["Location", ticket.location || "Not provided"],
      ["SLA due", UI.formatDate(ticket.slaDueAt)],
      ["Classification confidence", `${Number(ticket.classificationConfidence || 0)}%`],
      ["Routing explanation", ticket.routingReason || "Not provided"]
    ];
    document.getElementById("receiverTechnicalDetails").innerHTML = technical.map(([label, value]) => `
      <div class="detail-cell"><small>${UI.escapeHtml(label)}</small><strong>${UI.escapeHtml(value)}</strong></div>
    `).join("");

    if (!ticketDialog.open) ticketDialog.showModal();
  }

  function openTicket(ticketId) {
    const ticket = Store.getTicket(ticketId);
    if (ticket) renderReceiverTicket(ticket);
  }

  function refreshOpenTicket() {
    if (!currentTicketId) return;
    const ticket = Store.getTicket(currentTicketId);
    if (ticket) renderReceiverTicket(ticket);
  }

  function updateCurrentTicket(patch, historyText, toastMessage) {
    if (!currentTicketId) return null;
    const ticket = Store.updateTicket(currentTicketId, patch, historyText);
    if (ticket) {
      UI.showToast(toastMessage || `${ticket.number} updated.`);
      renderReceiverTicket(ticket);
    }
    return ticket;
  }

  function requireNote(actionName) {
    const note = document.getElementById("receiverActionNote").value.trim();
    if (!note) {
      UI.showToast(`Add a note before you ${actionName}.`);
      document.getElementById("receiverActionNote").focus();
      return "";
    }
    return note;
  }

  function handleWorkAction(event) {
    const claimButton = event.target.closest("[data-claim-ticket]");
    if (claimButton) {
      const ticket = Store.updateTicket(
        claimButton.dataset.claimTicket,
        { assignee: Store.CURRENT_USER.name },
        `Claimed by ${Store.CURRENT_USER.name}.`
      );
      if (ticket) UI.showToast(`${ticket.number} claimed by you.`);
      return;
    }

    const ticketButton = event.target.closest("[data-ticket-id]");
    if (ticketButton) openTicket(ticketButton.dataset.ticketId);
  }

  function render() {
    const items = getTickets();
    const visibleItems = filteredItems(items);
    renderCounts(items);
    renderQueueOptions(items);
    renderRecommended(items);
    renderQueueCards(items);
    renderWorkList(visibleItems);
    renderTable(visibleItems);
    updateViewControls();
    recommendedSection.hidden = currentView !== "recommended";
    teamQueueSection.hidden = currentView !== "team";
    document.getElementById("visibleTicketCount").textContent = `${visibleItems.length} shown`;
  }

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.workView;
      render();
    });
  });

  queueCards.addEventListener("click", (event) => {
    const button = event.target.closest("[data-queue-card]");
    if (!button) return;
    queueFilter.value = button.dataset.queueCard;
    render();
  });

  recommendedList.addEventListener("click", handleWorkAction);
  workList.addEventListener("click", handleWorkAction);
  tableBody.addEventListener("click", handleWorkAction);
  searchInput.addEventListener("input", render);
  queueFilter.addEventListener("change", render);

  document.querySelectorAll("[data-close-receiver-ticket]").forEach((button) => {
    button.addEventListener("click", () => ticketDialog.close());
  });

  document.getElementById("receiverClaimTicket").addEventListener("click", () => {
    updateCurrentTicket(
      { assignee: Store.CURRENT_USER.name },
      `Claimed by ${Store.CURRENT_USER.name}.`,
      "Ticket claimed."
    );
  });

  document.getElementById("receiverAssignTicket").addEventListener("click", () => {
    const assignee = document.getElementById("receiverAssigneeSelect").value;
    updateCurrentTicket(
      { assignee },
      assignee === "Unassigned" ? "Ticket ownership was cleared." : `Assigned to ${assignee}.`,
      assignee === "Unassigned" ? "Ticket returned to the unassigned queue." : `Ticket assigned to ${assignee}.`
    );
  });

  document.getElementById("receiverStartWork").addEventListener("click", () => {
    const ticket = Store.getTicket(currentTicketId);
    if (!ticket) return;
    updateCurrentTicket(
      {
        status: "In progress",
        assignee: !ticket.assignee || ticket.assignee === "Unassigned" ? Store.CURRENT_USER.name : ticket.assignee
      },
      `Work started by ${Store.CURRENT_USER.name}.`,
      "Work started."
    );
  });

  document.getElementById("receiverRequestInfo").addEventListener("click", () => {
    const note = requireNote("request more information");
    if (!note) return;
    const ticket = Store.getTicket(currentTicketId);
    updateCurrentTicket(
      { status: "Waiting on requester" },
      `Information requested from ${ticket ? ticket.requester : "the requester"} by ${Store.CURRENT_USER.name}: ${note}`,
      "Information request added to the timeline."
    );
  });

  document.getElementById("receiverAddUpdate").addEventListener("click", () => {
    const note = requireNote("add an update");
    if (!note) return;
    updateCurrentTicket(
      {},
      `Update from ${Store.CURRENT_USER.name}: ${note}`,
      "Update added to the ticket."
    );
  });

  document.getElementById("receiverResolveTicket").addEventListener("click", () => {
    const note = requireNote("resolve the ticket");
    if (!note) return;
    updateCurrentTicket(
      { status: "Resolved" },
      `Resolved by ${Store.CURRENT_USER.name}: ${note}`,
      "Ticket resolved."
    );
  });

  document.getElementById("receiverReopenTicket").addEventListener("click", () => {
    updateCurrentTicket(
      { status: "In progress", assignee: Store.CURRENT_USER.name },
      `Reopened by ${Store.CURRENT_USER.name}.`,
      "Ticket reopened."
    );
  });

  document.getElementById("receiverFeedbackButton").addEventListener("click", () => {
    const ticket = Store.getTicket(currentTicketId);
    if (!ticket) return;
    const analysis = Feedback.analyzeTicket(ticket);
    Feedback.open({
      sourceRole: "resolver",
      ticketId: ticket.id,
      templateId: ticket.details && ticket.details.requestTemplateId ? ticket.details.requestTemplateId : "",
      queue: ticket.queue,
      issueType: analysis.gaps.length ? "missing-information" : "receiver-brief",
      title: analysis.gaps.length ? `Improve information quality for ${ticket.title}` : `Improve the receiver brief for ${ticket.title}`,
      description: analysis.gaps.length
        ? `The receiver brief identified the following gaps: ${analysis.gaps.join(", ")}.`
        : "The ticket was workable, but the receiver brief could be clearer or more actionable.",
      suggestedChange: analysis.gaps.length
        ? `Capture ${analysis.gaps[0].toLowerCase()} earlier in the request flow.`
        : "Adjust the receiver brief wording so the requested outcome and first action are immediately clear.",
      missingFields: analysis.gaps,
      phrase: ticket.description || ""
    });
  });

  window.addEventListener("masterflow:state", () => {
    render();
    refreshOpenTicket();
  });

  render();

  const requestedTicketId = window.localStorage.getItem("masterflowReceiverOpenTicket");
  if (requestedTicketId) {
    window.localStorage.removeItem("masterflowReceiverOpenTicket");
    window.setTimeout(() => openTicket(requestedTicketId), 50);
  }
})();
