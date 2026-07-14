(function () {
  "use strict";

  const Store = window.MasterFlowStore;
  const UI = window.MasterFlowUI;

  if (!Store || !UI || !UI.layoutReady) return;

  const recommendedSection = document.getElementById("recommendedSection");
  const recommendedList = document.getElementById("recommendedWorkList");
  const teamQueueSection = document.getElementById("teamQueueSection");
  const queueCards = document.getElementById("workCenterQueueCards");
  const workList = document.getElementById("workCenterList");
  const tableBody = document.getElementById("workCenterTableBody");
  const searchInput = document.getElementById("workCenterSearch");
  const queueFilter = document.getElementById("workCenterQueueFilter");
  const viewButtons = Array.from(document.querySelectorAll("[data-work-view]"));

  const CLOSED_STATUSES = new Set(["Resolved", "Closed", "Cancelled"]);
  let currentView = "recommended";

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
      description: "Tickets that cannot progress until someone accepts ownership."
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

  function isClosed(ticket) {
    return CLOSED_STATUSES.has(String(ticket.status || ""));
  }

  function isWaitingOnRequester(ticket) {
    return /waiting on requester|waiting on employee/i.test(String(ticket.status || ""));
  }

  function minutesUntilDue(ticket) {
    const dueTime = new Date(ticket.slaDueAt).getTime();

    if (!Number.isFinite(dueTime)) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.round((dueTime - Date.now()) / 60000);
  }

  function isSlaRisk(ticket) {
    return !isClosed(ticket) && minutesUntilDue(ticket) <= 60;
  }

  function bucketFor(ticket) {
    if (isClosed(ticket)) return "completed";
    if (String(ticket.priority || "").startsWith("P1")) return "critical";
    if (isWaitingOnRequester(ticket)) return "waiting";
    if (isSlaRisk(ticket)) return "risk";
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

  function priorityWeight(priority) {
    const value = String(priority || "");

    if (value.startsWith("P1")) return 100;
    if (value.startsWith("P2")) return 60;
    if (value.startsWith("P3")) return 30;
    if (value.startsWith("P4")) return 10;

    return 20;
  }

  function calculateWorkScore(ticket) {
    if (isClosed(ticket)) return 0;

    let score = priorityWeight(ticket.priority);
    const minutes = minutesUntilDue(ticket);

    if (minutes < 0) {
      score += 80;
    } else if (minutes <= 15) {
      score += 60;
    } else if (minutes <= 60) {
      score += 40;
    } else if (minutes <= 240) {
      score += 20;
    }

    if (ticket.status === "Approval required") score += 30;
    if (ticket.status === "Triage") score += 25;
    if (ticket.status === "New") score += 15;
    if (ticket.assignee === Store.CURRENT_USER.name) score += 15;
    if (ticket.assignee === "Unassigned") score += 25;
    if (isWaitingOnRequester(ticket)) score -= 50;

    return score;
  }

  function priorityLabel(priority) {
    const code = String(priority || "").split(" - ")[0];
    const labels = {
      P1: "Critical",
      P2: "High",
      P3: "Normal",
      P4: "Low"
    };

    return labels[code] ? `${labels[code]} (${code})` : String(priority || "Normal");
  }

  function formatExactDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Not set";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function dueLabel(ticket) {
    if (isClosed(ticket)) {
      return `Completed ${formatExactDate(ticket.updatedAt)}`;
    }

    const minutes = minutesUntilDue(ticket);

    if (!Number.isFinite(minutes)) return "No SLA set";
    if (minutes < -60) return `Overdue by ${Math.ceil(Math.abs(minutes) / 60)}h`;
    if (minutes < 0) return `Overdue by ${Math.abs(minutes)}m`;
    if (minutes <= 60) return `Due in ${Math.max(1, minutes)}m`;
    if (minutes < 1440) return `Due in ${Math.ceil(minutes / 60)}h`;

    return `Due ${formatExactDate(ticket.slaDueAt)}`;
  }

  function recommendedNextAction(ticket) {
    if (isClosed(ticket)) {
      return "Review the resolution or reopen the ticket if the issue returns.";
    }

    if (String(ticket.priority || "").startsWith("P1")) {
      return "Open the incident and begin the critical response now.";
    }

    if (ticket.status === "Approval required") {
      return "Review the request and approve or reject the next step.";
    }

    if (ticket.status === "Triage") {
      return "Confirm the correct queue and assign an owner.";
    }

    if (isWaitingOnRequester(ticket)) {
      return "Wait for the requester or send a reminder for the missing information.";
    }

    if (ticket.assignee === "Unassigned") {
      return "Claim the ticket or assign it to the best available team member.";
    }

    if (ticket.status === "New") {
      return "Review the request details and begin work.";
    }

    if (ticket.status === "In progress") {
      return "Continue the investigation and post the next update.";
    }

    return "Review the ticket and complete the next available action.";
  }

  function businessImpact(ticket) {
    if (String(ticket.priority || "").startsWith("P1")) {
      return "A critical warehouse or shipping process may be blocked.";
    }

    if (ticket.status === "Approval required") {
      return "Work cannot continue until an authorized decision is recorded.";
    }

    if (ticket.status === "Triage") {
      return "The receiving team is not confirmed, so the request cannot progress normally.";
    }

    if (isWaitingOnRequester(ticket)) {
      return "Support is blocked until the requester provides more information.";
    }

    return ticket.description || "This request is active and ready for review.";
  }

  function priorityReasons(ticket) {
    const reasons = [];
    const minutes = minutesUntilDue(ticket);

    if (String(ticket.priority || "").startsWith("P1")) reasons.push("Critical operational impact");
    if (minutes < 0) reasons.push("SLA is overdue");
    else if (minutes <= 60) reasons.push("SLA due within one hour");
    if (ticket.status === "Approval required") reasons.push("Decision required");
    if (ticket.status === "Triage") reasons.push("Routing must be confirmed");
    if (ticket.assignee === Store.CURRENT_USER.name) reasons.push("Assigned to you");
    if (ticket.assignee === "Unassigned") reasons.push("No owner assigned");
    if (isWaitingOnRequester(ticket)) reasons.push("Blocked by missing information");
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
        if (isClosed(a.ticket) !== isClosed(b.ticket)) {
          return isClosed(a.ticket) ? 1 : -1;
        }

        if (b.score !== a.score) return b.score - a.score;

        return new Date(a.ticket.slaDueAt).getTime() - new Date(b.ticket.slaDueAt).getTime();
      });
  }

  function matchesView(item) {
    const ticket = item.ticket;

    if (currentView === "recommended") return !isClosed(ticket);
    if (currentView === "mine") return !isClosed(ticket) && ticket.assignee === Store.CURRENT_USER.name;
    if (currentView === "team") return !isClosed(ticket);
    if (currentView === "unassigned") return !isClosed(ticket) && ticket.assignee === "Unassigned";
    if (currentView === "risk") return isSlaRisk(ticket);
    if (currentView === "waiting") return !isClosed(ticket) && isWaitingOnRequester(ticket);
    if (currentView === "completed") return isClosed(ticket);

    return true;
  }

  function filteredItems(items) {
    const query = searchInput.value.trim().toLowerCase();
    const selectedQueue = queueFilter.value;

    return items.filter((item) => {
      const ticket = item.ticket;
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
        recommendedNextAction(ticket)
      ].join(" ").toLowerCase();

      return (
        matchesView(item) &&
        (selectedQueue === "all" || ticket.queue === selectedQueue) &&
        (!query || haystack.includes(query))
      );
    });
  }

  function renderCounts(items) {
    const active = items.filter((item) => !isClosed(item.ticket));
    const completed = items.filter((item) => isClosed(item.ticket));

    const counts = {
      recommended: active.length,
      mine: active.filter((item) => item.ticket.assignee === Store.CURRENT_USER.name).length,
      team: active.length,
      unassigned: active.filter((item) => item.ticket.assignee === "Unassigned").length,
      risk: active.filter((item) => isSlaRisk(item.ticket)).length,
      waiting: active.filter((item) => isWaitingOnRequester(item.ticket)).length,
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

    if (["all", ...queues].includes(existing)) {
      queueFilter.value = existing;
    }
  }

  function queueSummary(items) {
    const active = items.filter((item) => !isClosed(item.ticket));
    const queues = [...new Set(active.map((item) => item.ticket.queue))];

    return queues
      .map((name) => {
        const tickets = active.filter((item) => item.ticket.queue === name);
        return {
          name,
          count: tickets.length,
          unassigned: tickets.filter((item) => item.ticket.assignee === "Unassigned").length,
          risk: tickets.filter((item) => isSlaRisk(item.ticket)).length,
          critical: tickets.filter((item) => String(item.ticket.priority || "").startsWith("P1")).length
        };
      })
      .sort((a, b) => {
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
        <button
          class="queue-card${className}"
          type="button"
          data-queue-card="${UI.escapeHtml(queue.name)}"
        >
          <h3>${UI.escapeHtml(queue.name)}</h3>
          <div class="queue-number">${queue.count}</div>
          <div class="queue-meta">${UI.escapeHtml(details.join(" · "))}</div>
        </button>
      `;
    }).join("");
  }

  function recommendedMarkup(item, index) {
    const ticket = item.ticket;
    const reasons = priorityReasons(ticket)
      .map((reason) => `<span>${UI.escapeHtml(reason)}</span>`)
      .join("");

    return `
      <article class="work-card work-card-recommended is-${item.bucket}">
        <div class="work-rank" aria-label="Recommended position ${index + 1}">
          <small>Work</small>
          <strong>${index + 1}</strong>
        </div>

        <div class="work-card-main">
          <div class="work-card-topline">
            <span class="badge ${bucketBadgeClass(item.bucket)}">${UI.escapeHtml(bucketLabel(item.bucket))}</span>
            <span class="work-due">${UI.escapeHtml(dueLabel(ticket))}</span>
          </div>

          <button class="work-ticket-title" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">
            ${UI.escapeHtml(ticket.title)}
          </button>

          <div class="work-ticket-reference">
            ${UI.escapeHtml(ticket.number)} · ${UI.escapeHtml(ticket.queue)}
          </div>

          <p class="work-impact">${UI.escapeHtml(businessImpact(ticket))}</p>

          <div class="work-next-action">
            <small>Recommended next action</small>
            <strong>${UI.escapeHtml(recommendedNextAction(ticket))}</strong>
          </div>

          <div class="work-reason-list">${reasons}</div>
        </div>

        <div class="work-card-actions">
          ${ticket.assignee === "Unassigned" && !isClosed(ticket)
            ? `<button class="btn btn-primary btn-sm" type="button" data-assign-ticket="${UI.escapeHtml(ticket.id)}">Assign to me</button>`
            : ""}
          <button class="btn btn-secondary btn-sm" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">Open request</button>
        </div>
      </article>
    `;
  }

  function workCardMarkup(item) {
    const ticket = item.ticket;
    const reasons = priorityReasons(ticket)
      .map((reason) => `<span>${UI.escapeHtml(reason)}</span>`)
      .join("");

    return `
      <article class="work-card is-${item.bucket}">
        <div class="work-card-main">
          <div class="work-card-topline">
            <span class="badge ${bucketBadgeClass(item.bucket)}">${UI.escapeHtml(bucketLabel(item.bucket))}</span>
            <span class="work-due">${UI.escapeHtml(dueLabel(ticket))}</span>
          </div>

          <button class="work-ticket-title" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">
            ${UI.escapeHtml(ticket.title)}
          </button>

          <div class="work-ticket-reference">
            ${UI.escapeHtml(ticket.number)} · ${UI.escapeHtml(ticket.queue)}
          </div>

          <div class="work-next-action compact">
            <small>Next action</small>
            <strong>${UI.escapeHtml(recommendedNextAction(ticket))}</strong>
          </div>

          <div class="work-meta">
            <span>Owner: <strong>${UI.escapeHtml(ticket.assignee || "Unassigned")}</strong></span>
            <span>Requester: <strong>${UI.escapeHtml(ticket.requester)}</strong></span>
            <span>Priority: <strong>${UI.escapeHtml(priorityLabel(ticket.priority))}</strong></span>
          </div>

          <div class="work-reason-list">${reasons}</div>
        </div>

        <div class="work-card-actions">
          ${ticket.assignee === "Unassigned" && !isClosed(ticket)
            ? `<button class="btn btn-primary btn-sm" type="button" data-assign-ticket="${UI.escapeHtml(ticket.id)}">Assign to me</button>`
            : ""}
          <button class="btn btn-secondary btn-sm" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">${isClosed(ticket) ? "View" : "Open"}</button>
        </div>
      </article>
    `;
  }

  function renderRecommended(items) {
    const active = items.filter((item) => !isClosed(item.ticket));
    const actionable = active.filter((item) => !isWaitingOnRequester(item.ticket));
    const recommended = (actionable.length ? actionable : active).slice(0, 3);

    if (!recommended.length) {
      recommendedList.innerHTML = '<div class="empty-state">No active tickets need attention.</div>';
      return;
    }

    recommendedList.innerHTML = recommended.map(recommendedMarkup).join("");
  }

  function renderWorkList(items) {
    if (!items.length) {
      workList.innerHTML = '<div class="empty-state">No tickets match this view.</div>';
      return;
    }

    workList.innerHTML = items.map(workCardMarkup).join("");
  }

  function renderTable(items) {
    if (!items.length) {
      tableBody.innerHTML = '<tr><td colspan="7"><div class="empty-state">No tickets match this view.</div></td></tr>';
      return;
    }

    tableBody.innerHTML = items.map((item) => {
      const ticket = item.ticket;

      return `
        <tr>
          <td>
            <button class="link-button" type="button" data-ticket-id="${UI.escapeHtml(ticket.id)}">
              ${UI.escapeHtml(ticket.number)} - ${UI.escapeHtml(ticket.title)}
            </button>
            <span class="subtext">${UI.escapeHtml(ticket.category)}</span>
          </td>
          <td><span class="badge ${UI.priorityClass(ticket.priority)}">${UI.escapeHtml(priorityLabel(ticket.priority))}</span></td>
          <td><span class="badge ${UI.statusClass(ticket.status)}">${UI.escapeHtml(ticket.status)}</span></td>
          <td>${UI.escapeHtml(ticket.queue)}</td>
          <td>${UI.escapeHtml(ticket.assignee || "Unassigned")}</td>
          <td>
            <strong>${UI.escapeHtml(dueLabel(ticket))}</strong>
            <span class="subtext">${UI.escapeHtml(formatExactDate(ticket.slaDueAt))}</span>
          </td>
          <td>
            ${ticket.assignee === "Unassigned" && !isClosed(ticket)
              ? `<button class="btn btn-secondary btn-sm" type="button" data-assign-ticket="${UI.escapeHtml(ticket.id)}">Assign to me</button>`
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

  function openTicket(ticketId) {
    const ticket = Store.getTicket(ticketId);
    if (ticket) UI.openTicketDialog(ticket);
  }

  function handleWorkAction(event) {
    const assignButton = event.target.closest("[data-assign-ticket]");
    if (assignButton) {
      const ticket = Store.updateTicket(
        assignButton.dataset.assignTicket,
        {
          assignee: Store.CURRENT_USER.name,
          status: "In progress"
        },
        `Assigned to ${Store.CURRENT_USER.name}.`
      );

      if (ticket) UI.showToast(`${ticket.number} assigned to you.`);
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
  window.addEventListener("masterflow:state", render);

  render();
})();
