(function () {
  "use strict";

  const Store = window.MasterFlowStore;
  const UI = window.MasterFlowUI;

  if (!Store || !UI || !UI.layoutReady) return;

  const recommendedList =
    document.getElementById("recommendedWorkList");

  const ticketCardList =
    document.getElementById("assignedWorkCards");

  const tableBody =
    document.getElementById("assignedWorkBody");

  const searchInput =
    document.getElementById("assignedSearch");

  const viewFilter =
    document.getElementById("assignedViewFilter");

  const smartViewButtons =
    Array.from(document.querySelectorAll("[data-view]"));

  const CLOSED_STATUSES =
    new Set(["Resolved", "Closed", "Cancelled"]);

  function isClosed(ticket) {
    return CLOSED_STATUSES.has(ticket.status);
  }

  function isWaitingOnRequester(ticket) {
    return /waiting on requester|waiting on employee/i.test(
      String(ticket.status || "")
    );
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
    if (String(ticket.priority).startsWith("P1")) {
      return "critical";
    }

    if (isWaitingOnRequester(ticket)) {
      return "waiting";
    }

    if (isSlaRisk(ticket)) {
      return "risk";
    }

    return "ready";
  }

  function bucketLabel(bucket) {
    const labels = {
      critical: "Critical operations",
      risk: "SLA risk",
      ready: "Ready to work",
      waiting: "Waiting on requester"
    };

    return labels[bucket] || "Active";
  }

  function bucketBadgeClass(bucket) {
    const classes = {
      critical: "badge-red",
      risk: "badge-amber",
      ready: "badge-teal",
      waiting: "badge-purple"
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

    if (ticket.status === "Approval required") {
      score += 30;
    }

    if (ticket.status === "Triage") {
      score += 25;
    }

    if (ticket.status === "New") {
      score += 15;
    }

    if (ticket.assignee === Store.CURRENT_USER.name) {
      score += 10;
    }

    if (ticket.assignee === "Unassigned") {
      score += 15;
    }

    /*
     * A ticket waiting on the requester may still need
     * monitoring, but it should not outrank work the
     * receiver can complete immediately.
     */
    if (isWaitingOnRequester(ticket)) {
      score -= 50;
    }

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

    return labels[code]
      ? `${labels[code]} (${code})`
      : String(priority || "Normal");
  }

  function formatExactDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "No due time";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function dueLabel(ticket) {
    const minutes = minutesUntilDue(ticket);

    if (!Number.isFinite(minutes)) {
      return "No due time";
    }

    if (minutes < -60) {
      return `Overdue by ${Math.ceil(Math.abs(minutes) / 60)}h`;
    }

    if (minutes < 0) {
      return `Overdue by ${Math.abs(minutes)}m`;
    }

    if (minutes <= 60) {
      return `Due in ${Math.max(1, minutes)}m`;
    }

    if (minutes < 1440) {
      return `Due in ${Math.ceil(minutes / 60)}h`;
    }

    return `Due ${formatExactDate(ticket.slaDueAt)}`;
  }

  function recommendedNextAction(ticket) {
    if (String(ticket.priority).startsWith("P1")) {
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
    if (String(ticket.priority).startsWith("P1")) {
      return "A critical warehouse or shipping process may be blocked.";
    }

    if (ticket.status === "Approval required") {
      return "Work cannot continue until an authorized decision is recorded.";
    }

    if (ticket.status === "Triage") {
      return "The receiving team is not yet confirmed, so the request cannot progress normally.";
    }

    if (isWaitingOnRequester(ticket)) {
      return "Support is blocked until the requester provides more information.";
    }

    return ticket.description ||
      "This request is active and ready for review.";
  }

  function priorityReasons(ticket) {
    const reasons = [];
    const minutes = minutesUntilDue(ticket);

    if (String(ticket.priority).startsWith("P1")) {
      reasons.push("Critical operational impact");
    }

    if (minutes < 0) {
      reasons.push("SLA is overdue");
    } else if (minutes <= 60) {
      reasons.push("SLA due within one hour");
    }

    if (ticket.status === "Approval required") {
      reasons.push("Decision required");
    }

    if (ticket.status === "Triage") {
      reasons.push("Routing must be confirmed");
    }

    if (ticket.assignee === Store.CURRENT_USER.name) {
      reasons.push("Assigned to you");
    }

    if (ticket.assignee === "Unassigned") {
      reasons.push("No owner assigned");
    }

    if (isWaitingOnRequester(ticket)) {
      reasons.push("Blocked by missing information");
    }

    if (!reasons.length) {
      reasons.push("Ready for action");
    }

    return reasons.slice(0, 3);
  }

  function getTickets() {
    const state = Store.getState();

    return state.tickets
      .filter((ticket) => !isClosed(ticket))
      .filter((ticket) => {
        return (
          ticket.assignee === Store.CURRENT_USER.name ||
          ticket.queue === "Megan Delia - Triage" ||
          String(ticket.priority).startsWith("P1")
        );
      })
      .map((ticket) => {
        return {
          ticket,
          bucket: bucketFor(ticket),
          score: calculateWorkScore(ticket)
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          new Date(a.ticket.slaDueAt).getTime() -
          new Date(b.ticket.slaDueAt).getTime()
        );
      });
  }

  function renderCounts(items) {
    const criticalCount =
      items.filter((item) => item.bucket === "critical").length;

    const riskCount =
      items.filter((item) => isSlaRisk(item.ticket)).length;

    const readyCount =
      items.filter((item) => item.bucket === "ready").length;

    const waitingCount =
      items.filter((item) => item.bucket === "waiting").length;

    document.getElementById("criticalCount").textContent =
      String(criticalCount);

    document.getElementById("assignedRiskCount").textContent =
      String(riskCount);

    document.getElementById("readyCount").textContent =
      String(readyCount);

    document.getElementById("waitingCount").textContent =
      String(waitingCount);

    document.getElementById("activeTicketCount").textContent =
      `${items.length} active`;
  }

  function recommendedMarkup(item, index) {
    const ticket = item.ticket;

    const reasonMarkup = priorityReasons(ticket)
      .map((reason) => {
        return `<span>${UI.escapeHtml(reason)}</span>`;
      })
      .join("");

    return `
      <article class="receiver-recommended-item is-${item.bucket}">
        <div class="receiver-rank" aria-label="Recommended position ${index + 1}">
          <small>Work</small>
          <strong>${index + 1}</strong>
        </div>

        <div class="receiver-recommended-main">
          <div class="receiver-card-topline">
            <span class="badge ${bucketBadgeClass(item.bucket)}">
              ${UI.escapeHtml(bucketLabel(item.bucket))}
            </span>

            <span class="receiver-due">
              ${UI.escapeHtml(dueLabel(ticket))}
            </span>
          </div>

          <button
            class="receiver-ticket-title"
            type="button"
            data-ticket-id="${UI.escapeHtml(ticket.id)}"
          >
            ${UI.escapeHtml(ticket.title)}
          </button>

          <div class="receiver-ticket-reference">
            ${UI.escapeHtml(ticket.number)}
            ·
            ${UI.escapeHtml(ticket.queue)}
          </div>

          <p class="receiver-impact">
            ${UI.escapeHtml(businessImpact(ticket))}
          </p>

          <div class="receiver-next-action">
            <small>Recommended next action</small>
            <strong>
              ${UI.escapeHtml(recommendedNextAction(ticket))}
            </strong>
          </div>

          <div class="receiver-reason-list">
            ${reasonMarkup}
          </div>
        </div>

        <button
          class="btn btn-primary btn-sm receiver-open-button"
          type="button"
          data-ticket-id="${UI.escapeHtml(ticket.id)}"
        >
          Open request
        </button>
      </article>
    `;
  }

  function renderRecommended(items) {
    /*
     * Prefer work that the receiver can act on.
     * Waiting-on-requester tickets are used only when
     * there are no actionable tickets available.
     */
    const actionable =
      items.filter((item) => item.bucket !== "waiting");

    const recommended =
      (actionable.length ? actionable : items).slice(0, 3);

    if (!recommended.length) {
      recommendedList.innerHTML = `
        <div class="empty-state">
          No active assigned tickets need attention.
        </div>
      `;
      return;
    }

    recommendedList.innerHTML = recommended
      .map(recommendedMarkup)
      .join("");
  }

  function ticketCardMarkup(item) {
    const ticket = item.ticket;

    return `
      <article class="receiver-ticket-card is-${item.bucket}">
        <div class="receiver-ticket-card-main">
          <div class="receiver-card-topline">
            <span class="badge ${bucketBadgeClass(item.bucket)}">
              ${UI.escapeHtml(bucketLabel(item.bucket))}
            </span>

            <span class="receiver-due">
              ${UI.escapeHtml(dueLabel(ticket))}
            </span>
          </div>

          <button
            class="receiver-ticket-title"
            type="button"
            data-ticket-id="${UI.escapeHtml(ticket.id)}"
          >
            ${UI.escapeHtml(ticket.title)}
          </button>

          <div class="receiver-ticket-reference">
            ${UI.escapeHtml(ticket.number)}
            ·
            ${UI.escapeHtml(ticket.queue)}
          </div>

          <div class="receiver-next-action compact">
            <small>Next action</small>
            <strong>
              ${UI.escapeHtml(recommendedNextAction(ticket))}
            </strong>
          </div>

          <div class="receiver-card-meta">
            <span>
              Current owner:
              <strong>${UI.escapeHtml(ticket.assignee)}</strong>
            </span>

            <span>
              Requester:
              <strong>${UI.escapeHtml(ticket.requester)}</strong>
            </span>

            <span>
              Priority:
              <strong>${UI.escapeHtml(priorityLabel(ticket.priority))}</strong>
            </span>
          </div>
        </div>

        <button
          class="btn btn-secondary btn-sm"
          type="button"
          data-ticket-id="${UI.escapeHtml(ticket.id)}"
        >
          Open
        </button>
      </article>
    `;
  }

  function matchesView(item, selectedView) {
    if (selectedView === "all") return true;
    if (selectedView === "critical") {
      return item.bucket === "critical";
    }
    if (selectedView === "risk") {
      return isSlaRisk(item.ticket);
    }
    if (selectedView === "ready") {
      return item.bucket === "ready";
    }
    if (selectedView === "waiting") {
      return item.bucket === "waiting";
    }

    return true;
  }

  function filteredItems(items) {
    const query = searchInput.value.trim().toLowerCase();
    const selectedView = viewFilter.value;

    return items.filter((item) => {
      const ticket = item.ticket;

      const haystack = [
        ticket.number,
        ticket.title,
        ticket.description,
        ticket.queue,
        ticket.assignee,
        ticket.requester,
        ticket.status,
        ticket.location,
        recommendedNextAction(ticket)
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesView(item, selectedView) &&
        (!query || haystack.includes(query))
      );
    });
  }

  function renderTicketCards(items) {
    if (!items.length) {
      ticketCardList.innerHTML = `
        <div class="empty-state">
          No active tickets match this view.
        </div>
      `;
      return;
    }

    ticketCardList.innerHTML =
      items.map(ticketCardMarkup).join("");
  }

  function renderTable(items) {
    if (!items.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state">
              No active tickets match this view.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = items
      .map((item) => {
        const ticket = item.ticket;

        return `
          <tr>
            <td>
              <button
                class="link-button"
                type="button"
                data-ticket-id="${UI.escapeHtml(ticket.id)}"
              >
                ${UI.escapeHtml(ticket.title)}
              </button>

              <span class="subtext">
                ${UI.escapeHtml(ticket.number)}
                ·
                ${UI.escapeHtml(ticket.queue)}
              </span>
            </td>

            <td>
              <span class="badge ${UI.priorityClass(ticket.priority)}">
                ${UI.escapeHtml(priorityLabel(ticket.priority))}
              </span>
            </td>

            <td>
              <span class="badge ${UI.statusClass(ticket.status)}">
                ${UI.escapeHtml(ticket.status)}
              </span>
            </td>

            <td>
              ${UI.escapeHtml(ticket.assignee)}
            </td>

            <td>
              <strong>${UI.escapeHtml(dueLabel(ticket))}</strong>
              <span class="subtext">
                ${UI.escapeHtml(formatExactDate(ticket.slaDueAt))}
              </span>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function updateSmartViewButtons() {
    smartViewButtons.forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.view === viewFilter.value
      );
    });
  }

  function openTicket(ticketId) {
    const ticket = Store.getTicket(ticketId);

    if (ticket) {
      UI.openTicketDialog(ticket);
    }
  }

  function handleTicketClick(event) {
    const button = event.target.closest("[data-ticket-id]");

    if (!button) return;

    openTicket(button.dataset.ticketId);
  }

  function render() {
    const items = getTickets();
    const visibleItems = filteredItems(items);

    renderCounts(items);
    renderRecommended(items);
    renderTicketCards(visibleItems);
    renderTable(visibleItems);
    updateSmartViewButtons();
  }

  smartViewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      viewFilter.value = button.dataset.view;
      render();
    });
  });

  searchInput.addEventListener("input", render);
  viewFilter.addEventListener("change", render);

  recommendedList.addEventListener(
    "click",
    handleTicketClick
  );

  ticketCardList.addEventListener(
    "click",
    handleTicketClick
  );

  tableBody.addEventListener(
    "click",
    handleTicketClick
  );

  window.addEventListener(
    "masterflow:state",
    render
  );

  render();
})();