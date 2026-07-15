(function () {
  "use strict";

  const Store = window.MasterFlowStore;
  if (!Store) throw new Error("MasterFlowStore must load before layout.js");

  const pages = {
    home: {
      href: "index.html",
      label: "Home",
      icon: "⌂",
      group: "For me",
      roles: ["requester", "receiver", "admin"],
      title: "Home",
      subtitle: "Create a request in your own words."
    },
    "my-tickets": {
      href: "my-tickets.html",
      label: "My requests",
      icon: "✓",
      group: "For me",
      roles: ["requester", "receiver", "admin"],
      title: "My requests",
      subtitle: "Track updates and continue request conversations."
    },
    "help-articles": {
      href: "help-articles.html",
      label: "Help articles",
      icon: "?",
      group: "For me",
      roles: ["requester", "receiver", "admin"],
      title: "Help articles",
      subtitle: "Search practical self-service guidance."
    },
    "smart-request": {
      href: "smart-request.html",
      label: "Smart request",
      icon: "✦",
      group: null,
      roles: ["requester", "receiver", "admin"],
      title: "Smart Request Builder",
      subtitle: "Review the existing request template and fill only what is missing."
    },
    "request-submitted": {
      href: "request-submitted.html",
      label: "Request submitted",
      icon: "✓",
      group: null,
      roles: ["requester", "receiver", "admin"],
      title: "Request submitted",
      subtitle: "Your request was created and routed."
    },
"assigned-work": {
  href: "assigned-work.html",
  label: "Work Center",
  icon: "◆",
  group: "Operations",
  roles: ["receiver", "admin"],
  title: "Work Center",
  subtitle: "Prioritized personal and team ticket work in one place."
},
"ticket-queues": {
  href: "ticket-queues.html",
  label: "Legacy ticket queues",
  icon: "☷",
  group: null,
  roles: ["receiver", "admin"],
  title: "Opening Work Center",
  subtitle: "Ticket queues are now part of the unified Work Center."
},
    freight: {
      href: "freight-optimization.html",
      label: "Freight optimization",
      icon: "⇄",
      group: "Operations",
      roles: ["receiver", "admin"],
      title: "Freight optimization",
      subtitle: "Review actionable savings opportunities before cost is incurred."
    },
    reporting: {
      href: "reporting.html",
      label: "Reporting",
      icon: "▥",
      group: "Operations",
      roles: ["receiver", "admin"],
      title: "Reporting",
      subtitle: "Measure service performance and verified freight savings."
    },
    "admin-templates": {
      href: "admin-templates.html",
      label: "Request templates",
      icon: "▤",
      group: "Administration",
      roles: ["admin"],
      title: "Request templates",
      subtitle: "Configure dynamic fields, queues, SLAs, and AI trigger phrases."
    },
    admin: {
      href: "admin-rules-access.html",
      label: "Rules & access",
      icon: "⚙",
      group: "Administration",
      roles: ["admin"],
      title: "Rules & access",
      subtitle: "Configure common routing, approval, SLA, and permission rules."
    },
    "project-summary": {
      href: "project-summary.html",
      label: "Project summary",
      icon: "i",
      group: "Administration",
      roles: ["admin"],
      title: "Project summary",
      subtitle: "Locked product direction and Claude handoff context."
    }
  };

  const currentPage = document.body.dataset.page || "home";
  const pageDefinition = pages[currentPage] || pages.home;
  const roleLabels = {
    requester: "Regular user",
    receiver: "Ticket receiver",
    admin: "Administrator"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#039;",
      '"': "&quot;"
    }[char]));
  }

  function formatDate(value) {
    if (!value) return "Not set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function formatMoney(value, maximumFractionDigits) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: maximumFractionDigits == null ? 2 : maximumFractionDigits
    }).format(Number(value || 0));
  }

  function priorityClass(priority) {
    if (String(priority).startsWith("P1")) return "badge-red";
    if (String(priority).startsWith("P2")) return "badge-amber";
    return "badge-blue";
  }

  function statusClass(status) {
    const text = String(status || "").toLowerCase();
    if (text.includes("resolved") || text.includes("closed") || text.includes("approved") || text.includes("ready")) return "badge-green";
    if (text.includes("critical") || text.includes("breach") || text.includes("stopped")) return "badge-red";
    if (text.includes("waiting") || text.includes("review") || text.includes("hold") || text.includes("approval") || text.includes("triage")) return "badge-amber";
    if (text.includes("release")) return "badge-gray";
    return "badge-blue";
  }

  function getRole() {
    return Store.getRole();
  }

  function isAllowed(pageId, role) {
    return Boolean(pages[pageId] && pages[pageId].roles.includes(role));
  }

  function safeLanding(role) {
    if (role === "admin") return pages.admin.href;
    if (role === "receiver") return pages["assigned-work"].href;
    return pages.home.href;
  }

  function counts() {
    const state = Store.getState();
    const openTickets = state.tickets.filter((ticket) => !["Resolved", "Closed"].includes(ticket.status));
    const requesterTickets = openTickets.filter((ticket) => ticket.requester === Store.CURRENT_USER.name).length;
    const queueTickets = openTickets.length;
    const freight = state.freightOpportunities.filter((item) => !["Released unchanged"].includes(item.status) && !item.decision).length;
    return { requesterTickets, queueTickets, freight };
  }

  function navMarkup(role) {
    const pageCounts = counts();
    const groupOrder = ["For me", "Operations", "Administration"];
    return groupOrder.map((group) => {
      const links = Object.entries(pages)
        .filter(([, definition]) => definition.group === group && definition.roles.includes(role))
        .map(([id, definition]) => {
          let badge = "";
          if (id === "my-tickets" && pageCounts.requesterTickets) badge = `<span class="nav-badge">${pageCounts.requesterTickets}</span>`;
          if (id === "assigned-work" && pageCounts.queueTickets) badge = `<span class="nav-badge">${pageCounts.queueTickets}</span>`;
          if (id === "freight" && pageCounts.freight) badge = `<span class="nav-badge">${pageCounts.freight}</span>`;
          return `<a class="nav-link${id === currentPage ? " active" : ""}" href="${definition.href}" data-page-link="${id}"><span class="nav-icon" aria-hidden="true">${definition.icon}</span><span>${definition.label}</span>${badge}</a>`;
        }).join("");
      if (!links) return "";
      return `<nav class="nav-group" aria-label="${group}"><div class="nav-label">${group}</div>${links}</nav>`;
    }).join("");
  }

  function renderLayout() {
    const role = getRole();
    if (!isAllowed(currentPage, role)) {
      window.sessionStorage.setItem("masterflowFlash", "That workspace is not available in the selected demo role.");
      window.location.replace(safeLanding(role));
      return false;
    }

    document.body.dataset.role = role;
    const topbar = document.createElement("header");
    topbar.className = "topbar";
    topbar.innerHTML = `
      <div class="topbar-left">
        <button class="menu-button" id="menuButton" aria-label="Open navigation" aria-expanded="false">☰</button>
<a class="brand-lockup" href="index.html" aria-label="MasterFlow home">
  <span class="brand-mark">
    <img src="assets/images/master-logo.png" alt="Master Electronics logo">
  </span>
  <span class="brand-copy">
    <strong>MasterFlow</strong>
    <small>Powered by Master Electronics</small>
  </span>
</a>
        <div class="page-context">
          <span class="page-context-text"><h1>${escapeHtml(pageDefinition.title)}</h1><p>${escapeHtml(pageDefinition.subtitle)}</p></span>
        </div>
      </div>
      <div class="topbar-right">
        <label class="role-control" title="Prototype only. Production access would come from SSO permissions.">
          <span>Demo view</span>
          <select id="roleSelect" aria-label="Choose prototype role">
            <option value="requester"${role === "requester" ? " selected" : ""}>Regular user</option>
            <option value="receiver"${role === "receiver" ? " selected" : ""}>Ticket receiver</option>
            <option value="admin"${role === "admin" ? " selected" : ""}>Administrator</option>
          </select>
        </label>
        <button class="icon-button" type="button" title="Notifications" aria-label="Notifications">♢</button>
        <div class="avatar" title="${escapeHtml(Store.CURRENT_USER.name)}">${escapeHtml(Store.CURRENT_USER.initials)}</div>
      </div>`;

    const sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    sidebar.id = "sidebar";
    sidebar.setAttribute("aria-label", "Primary navigation");
    sidebar.innerHTML = `
      ${navMarkup(role)}
      <div class="sidebar-bottom">
        <div class="system-status">
          <small>Operational status</small>
          <div class="status-row"><span class="status-dot"></span>All core systems available</div>
        </div>
        <button class="sidebar-action sidebar-critical" type="button" data-open-critical><span class="nav-icon">!</span>Shipping is stopped</button>
        <button class="sidebar-action reset-demo" type="button" data-reset-demo><span class="nav-icon">↺</span>Reset demo data</button>
      </div>`;

    const scrim = document.createElement("div");
    scrim.className = "sidebar-scrim";
    scrim.id = "sidebarScrim";
    scrim.setAttribute("aria-hidden", "true");

    document.body.prepend(scrim);
    document.body.prepend(sidebar);
    document.body.prepend(topbar);
    document.body.insertAdjacentHTML("beforeend", criticalDialogMarkup());
    document.body.insertAdjacentHTML("beforeend", '<div class="toast-region" id="toastRegion" aria-live="polite" aria-atomic="true"></div>');

    bindLayoutEvents();
    const flash = window.sessionStorage.getItem("masterflowFlash");
    if (flash) {
      window.sessionStorage.removeItem("masterflowFlash");
      window.setTimeout(() => showToast(flash), 50);
    }
    return true;
  }

  function criticalDialogMarkup() {
    return `
      <dialog id="criticalDialog" aria-labelledby="criticalTitle">
        <form method="dialog" id="criticalForm">
          <div class="dialog-header">
            <div><h2 id="criticalTitle">Shipping is stopped</h2><p>Immediate P1 fast lane. No AI classification gate.</p></div>
            <button class="close-button" value="cancel" aria-label="Close">×</button>
          </div>
          <div class="dialog-body">
            <div class="notice notice-danger"><span>!</span><div><strong>Use this only when shipping or a critical warehouse process is blocked.</strong><p>Submitting notifies Warehouse Systems on-call and operations leadership.</p></div></div>
            <div class="field-row mt-18">
              <div class="field"><label for="criticalLocation">Warehouse or location</label><select class="select" id="criticalLocation" required><option value="">Choose location</option><option>PHX Warehouse</option><option>NY Warehouse</option><option>Customer Service</option><option>Other</option></select></div>
              <div class="field"><label for="criticalProcess">Process stopped</label><select class="select" id="criticalProcess" required><option value="">Choose process</option><option>Order picking</option><option>Packing</option><option>Manifesting</option><option>Receiving</option><option>ERP order entry</option><option>Other</option></select></div>
            </div>
            <div class="field-row mt-12">
              <div class="field"><label for="criticalStarted">When did it start?</label><input class="input" id="criticalStarted" required placeholder="Example: 10 minutes ago"></div>
              <div class="field"><label for="criticalUsers">People or stations affected</label><input class="input" id="criticalUsers" required placeholder="Example: 8 outbound stations"></div>
            </div>
            <div class="field mt-12"><label for="criticalSymptom">What is happening?</label><textarea class="textarea" id="criticalSymptom" required placeholder="Describe the error or blocked step in one or two sentences."></textarea></div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" value="cancel">Cancel</button>
            <button class="btn btn-danger" id="submitCritical" value="default">Create P1 and notify on-call</button>
          </div>
        </form>
      </dialog>`;
  }

  function openSidebar() {
    const sidebar = document.getElementById("sidebar");
    const scrim = document.getElementById("sidebarScrim");
    const button = document.getElementById("menuButton");
    if (!sidebar) return;
    sidebar.classList.add("open");
    scrim.classList.add("open");
    button.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const scrim = document.getElementById("sidebarScrim");
    const button = document.getElementById("menuButton");
    if (!sidebar) return;
    sidebar.classList.remove("open");
    scrim.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
  }

  function showToast(message, timeout) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), timeout || 4200);
  }

  function openCriticalDialog() {
    const dialog = document.getElementById("criticalDialog");
    if (dialog && !dialog.open) dialog.showModal();
  }

  function bindLayoutEvents() {
    document.getElementById("menuButton").addEventListener("click", () => {
      const sidebar = document.getElementById("sidebar");
      if (sidebar.classList.contains("open")) closeSidebar(); else openSidebar();
    });
    document.getElementById("sidebarScrim").addEventListener("click", closeSidebar);

    document.getElementById("roleSelect").addEventListener("change", (event) => {
      const role = Store.setRole(event.target.value);
      window.sessionStorage.setItem("masterflowFlash", `${roleLabels[role]} view enabled. Production access would come from SSO.`);
      window.location.href = safeLanding(role);
    });

    document.querySelectorAll("[data-open-critical]").forEach((button) => button.addEventListener("click", openCriticalDialog));

    document.querySelectorAll("[data-reset-demo]").forEach((button) => button.addEventListener("click", () => {
      const accepted = window.confirm("Reset all fictional tickets, freight decisions, and prototype settings?");
      if (!accepted) return;
      Store.resetState();
      window.sessionStorage.setItem("masterflowFlash", "Demo data reset to the original fictional scenario.");
      window.location.reload();
    }));

    const criticalForm = document.getElementById("criticalForm");
    criticalForm.addEventListener("submit", (event) => {
      const submitter = event.submitter;
      if (!submitter || submitter.id !== "submitCritical") return;
      event.preventDefault();
      if (!criticalForm.reportValidity()) return;
      const location = document.getElementById("criticalLocation").value;
      const process = document.getElementById("criticalProcess").value;
      const started = document.getElementById("criticalStarted").value.trim();
      const users = document.getElementById("criticalUsers").value.trim();
      const symptom = document.getElementById("criticalSymptom").value.trim();
      const ticket = Store.addTicket({
        title: `${process} unavailable at ${location}`,
        description: symptom,
        category: "Warehouse operations outage",
        priority: "P1 - Critical",
        queue: "Warehouse Systems / On-call",
        requester: Store.CURRENT_USER.name,
        status: "New",
        location,
        source: "Shipping is stopped fast lane",
        classificationConfidence: 100,
        routingReason: "Direct P1 fast-lane submission; no AI classification gate.",
        details: { process, started, affectedUsers: users },
        historyText: "P1 created. Warehouse Systems on-call and operations leadership notified."
      });
      document.getElementById("criticalDialog").close();
      criticalForm.reset();
      showToast(`${ticket.number} created. On-call and operations leadership were notified.`);
      window.dispatchEvent(new CustomEvent("masterflow:critical-created", { detail: ticket }));
    });

    window.addEventListener("masterflow:state", () => {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return;
      sidebar.querySelectorAll(".nav-group").forEach((node) => node.remove());
      sidebar.insertAdjacentHTML("afterbegin", navMarkup(getRole()));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSidebar();
    });
  }

function openTicketDialog(ticket) {
  const ticketId = ticket.id;
  let dialog = document.getElementById("sharedTicketDialog");

  if (!dialog) {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog
        id="sharedTicketDialog"
        class="ticket-workspace-dialog"
        aria-labelledby="sharedTicketTitle"
      >
        <div class="dialog-header">
          <div>
            <h2 id="sharedTicketTitle"></h2>
            <p id="sharedTicketSubtitle"></p>
          </div>
          <button
            class="close-button"
            type="button"
            data-close-ticket-dialog
            aria-label="Close"
          >×</button>
        </div>

        <div class="dialog-body" id="sharedTicketBody"></div>

        <div class="dialog-footer">
          <button
            class="btn btn-secondary"
            type="button"
            data-close-ticket-dialog
          >Close</button>
        </div>
      </dialog>
    `);

    dialog = document.getElementById("sharedTicketDialog");

    dialog
      .querySelectorAll("[data-close-ticket-dialog]")
      .forEach((button) => {
        button.addEventListener("click", () => dialog.close());
      });
  }

  const canManage = ["receiver", "admin"].includes(getRole());

  function isClosed(item) {
    return ["Resolved", "Closed", "Cancelled"].includes(item.status);
  }

  function isWaiting(item) {
    return /waiting on requester|waiting on employee/i.test(
      String(item.status || "")
    );
  }

  function minutesUntilDue(item) {
    const due = new Date(item.slaDueAt).getTime();
    if (!Number.isFinite(due)) return Number.POSITIVE_INFINITY;
    return Math.round((due - Date.now()) / 60000);
  }

  function dueLabel(item) {
    const minutes = minutesUntilDue(item);

    if (!Number.isFinite(minutes)) return "No SLA due time";
    if (isClosed(item)) return "SLA complete";
    if (minutes < -60) {
      return `SLA overdue by ${Math.ceil(Math.abs(minutes) / 60)} hours`;
    }
    if (minutes < 0) return `SLA overdue by ${Math.abs(minutes)} minutes`;
    if (minutes <= 60) return `SLA due in ${Math.max(1, minutes)} minutes`;
    if (minutes < 1440) return `SLA due in ${Math.ceil(minutes / 60)} hours`;

    return `SLA due ${formatDate(item.slaDueAt)}`;
  }

  function statusSummary(item) {
    const assignee = item.assignee && item.assignee !== "Unassigned"
      ? item.assignee
      : item.queue;

    if (isClosed(item)) {
      return "This request is complete. Reopen it only if the issue is still occurring.";
    }

    if (String(item.priority).startsWith("P1")) {
      return "A critical operational process is affected. Immediate response and frequent updates are required.";
    }

    if (isWaiting(item)) {
      return `${assignee} is waiting for information from ${item.requester} before work can continue.`;
    }

    if (item.status === "Approval required") {
      return "An authorized decision is required before this request can continue.";
    }

    if (item.status === "Triage") {
      return "Business Enablement must confirm the correct receiving queue and owner.";
    }

    if (!item.assignee || item.assignee === "Unassigned") {
      return "This request has not been assigned to an owner yet.";
    }

    if (item.status === "New") {
      return `${item.assignee} owns this request and should begin the initial review.`;
    }

    if (item.status === "In progress") {
      return `${item.assignee} is actively working this request.`;
    }

    return `${assignee} currently owns this request.`;
  }

  function nextAction(item) {
    if (isClosed(item)) {
      return "No action is required. Review the resolution or reopen the request if needed.";
    }

    if (String(item.priority).startsWith("P1")) {
      return "Acknowledge the incident, confirm the affected process and users, and begin the critical-response workflow now.";
    }

    if (item.status === "Approval required") {
      return "Review the request details and record an approval or rejection.";
    }

    if (item.status === "Triage") {
      return "Confirm the correct queue, select an owner, and move the request into active work.";
    }

    if (isWaiting(item)) {
      return "Review the latest question. Send a reminder if the requester has not responded within the expected time.";
    }

    if (!item.assignee || item.assignee === "Unassigned") {
      return "Assign the request to yourself or the best available team member.";
    }

    if (item.status === "New") {
      return "Review the request, validate the supplied information, and start work.";
    }

    if (item.status === "In progress") {
      return "Continue troubleshooting, document the result, and post the next update.";
    }

    return "Review the request and complete the next available action.";
  }

  function businessImpact(item) {
    const details = item.details || {};
    const category = String(item.category || "").toLowerCase();
    const title = String(item.title || "").toLowerCase();

    if (String(item.priority).startsWith("P1")) {
      const process = details.process || "A critical warehouse process";
      const affected = details.affectedUsers
        ? ` ${details.affectedUsers} are reported as affected.`
        : "";
      return `${process} is blocked at ${item.location}.${affected}`;
    }

    if (isWaiting(item)) {
      return "Resolution is paused because support is waiting for information from the requester.";
    }

    if (item.status === "Approval required") {
      return "The requested work or purchase cannot continue until an authorized decision is recorded.";
    }

    if (category.includes("printer") || title.includes("printer")) {
      return `Printing or label-production work at ${item.location} may be delayed until this request is resolved.`;
    }

    if (category.includes("access") || title.includes("access")) {
      return "The requester may be unable to use a required system, report, or business process.";
    }

    if (category.includes("performance") || title.includes("laptop")) {
      return "The employee can continue working, but device performance may reduce productivity.";
    }

    return `This active request affects work at ${item.location || "the reported location"}.`;
  }

  function missingInformation(item) {
    const historyText = (item.history || [])
      .map((entry) => entry.text)
      .join(" ")
      .toLowerCase();

    if (isWaiting(item)) {
      if (/printer label|printer asset|printer name|ip address/.test(historyText)) {
        return ["Printer name, asset number, or IP address"];
      }
      if (/manager approval|director approval|approval/.test(historyText)) {
        return ["Required approval decision"];
      }
      return ["Requester response to the latest question"];
    }

    if (!item.assignee || item.assignee === "Unassigned") {
      return ["Assigned owner"];
    }

    if (item.status === "Triage") {
      return ["Confirmed receiving queue", "Assigned owner"];
    }

    return ["No blocking information detected"];
  }

  function suggestedResolution(item) {
    const text = `${item.title} ${item.category} ${item.description}`.toLowerCase();

    if (text.includes("printer")) {
      return [
        "Confirm the printer name, asset number, or IP address.",
        "Verify the printer is online and reachable from the workstation.",
        "Reconnect or remap the printer and test a label or print job."
      ];
    }

    if (text.includes("laptop") || text.includes("performance")) {
      return [
        "Confirm whether one application or the whole device is affected.",
        "Review CPU, memory, storage, and startup applications.",
        "Restart, apply approved updates, and retest the reported workflow."
      ];
    }

    if (text.includes("access") || text.includes("report")) {
      return [
        "Confirm the exact system, report, and role required.",
        "Validate the business reason and required approval.",
        "Apply the approved access and confirm the requester can sign in."
      ];
    }

    if (String(item.priority).startsWith("P1") || text.includes("manifest")) {
      return [
        "Confirm the outage scope and whether all stations are affected.",
        "Check the shared system or service before troubleshooting individual stations.",
        "Post frequent updates and confirm recovery with Operations before resolving."
      ];
    }

    if (item.status === "Approval required") {
      return [
        "Verify the request details and business justification.",
        "Record the approval decision and notify the requester."
      ];
    }

    return [
      "Review the requester description and most recent activity.",
      "Confirm any missing facts before changing the ticket status.",
      "Document the action taken and the verified outcome."
    ];
  }

  function progressMarkup(item) {
    const status = String(item.status || "").toLowerCase();
    const assigned = Boolean(item.assignee && item.assignee !== "Unassigned");
    const workingReached =
      status.includes("in progress") ||
      status.includes("waiting") ||
      status.includes("approval") ||
      status.includes("resolved") ||
      status.includes("closed");
    const resolved = isClosed(item);

    const stages = [
      { label: "Submitted", state: "complete" },
      { label: "Routed", state: item.queue ? "complete" : "active" },
      { label: "Assigned", state: assigned ? "complete" : "active" },
      {
        label: isWaiting(item) ? "Waiting" : "Working",
        state: workingReached ? (resolved ? "complete" : "active") : "pending"
      },
      { label: "Resolved", state: resolved ? "complete" : "pending" }
    ];

    return stages
      .map((stage) => `
        <div class="ticket-progress-step ${stage.state}">
          <span>${stage.state === "complete" ? "✓" : ""}</span>
          <small>${escapeHtml(stage.label)}</small>
        </div>
      `)
      .join("");
  }

  function historyMarkup(item) {
    const history = (item.history || []).slice().reverse();

    if (!history.length) {
      return '<p class="muted small">No activity has been recorded yet.</p>';
    }

    return history
      .map((entry) => `
        <div class="ticket-activity-item">
          <span class="ticket-activity-dot"></span>
          <div>
            <strong>${escapeHtml(entry.text)}</strong>
            <small>${escapeHtml(formatDate(entry.at))}</small>
          </div>
        </div>
      `)
      .join("");
  }

  function renderTicket(currentTicket) {
    const missing = missingInformation(currentTicket);
    const suggestions = suggestedResolution(currentTicket);
    const closed = isClosed(currentTicket);
    const unassigned =
      !currentTicket.assignee || currentTicket.assignee === "Unassigned";

    document.getElementById("sharedTicketTitle").textContent =
      `${currentTicket.number} - ${currentTicket.title}`;

    document.getElementById("sharedTicketSubtitle").textContent =
      `${currentTicket.queue} · ${currentTicket.status}`;

    const managementPanel = canManage
      ? `
        <section class="ticket-action-panel">
          <div>
            <h3>Work this ticket</h3>
            <p>Add an update, ask the requester a question, or record the resolution.</p>
          </div>

          <textarea
            class="textarea"
            id="ticketUpdateText"
            placeholder="Write an update, question, or resolution note..."
          ></textarea>

          <div class="ticket-action-buttons">
            ${unassigned && !closed ? `
              <button class="btn btn-secondary btn-sm" type="button" data-ticket-action="assign">
                Assign to me
              </button>
            ` : ""}

            ${!closed && currentTicket.status !== "In progress" ? `
              <button class="btn btn-primary btn-sm" type="button" data-ticket-action="start">
                Start work
              </button>
            ` : ""}

            ${!closed ? `
              <button class="btn btn-secondary btn-sm" type="button" data-ticket-action="request-info">
                Request information
              </button>

              <button class="btn btn-soft btn-sm" type="button" data-ticket-action="resolve">
                Mark resolved
              </button>
            ` : `
              <button class="btn btn-secondary btn-sm" type="button" data-ticket-action="reopen">
                Reopen ticket
              </button>
            `}

            <button class="btn btn-ghost btn-sm" type="button" data-ticket-action="post">
              Post update
            </button>
          </div>
        </section>
      `
      : `
        <section class="ticket-action-panel">
          <div>
            <h3>Reply or add information</h3>
            <p>Your update stays in this request conversation.</p>
          </div>

          <textarea
            class="textarea"
            id="ticketUpdateText"
            placeholder="Add a reply, answer, or update..."
          ></textarea>

          <div class="ticket-action-buttons">
            <button class="btn btn-primary btn-sm" type="button" data-ticket-action="requester-reply">
              Send update
            </button>
          </div>
        </section>
      `;

    document.getElementById("sharedTicketBody").innerHTML = `
      <section class="ticket-status-hero ${
        String(currentTicket.priority).startsWith("P1")
          ? "is-critical"
          : isWaiting(currentTicket)
            ? "is-waiting"
            : closed
              ? "is-complete"
              : "is-active"
      }">
        <div>
          <span class="badge ${statusClass(currentTicket.status)}">
            ${escapeHtml(currentTicket.status)}
          </span>
          <h3>${escapeHtml(statusSummary(currentTicket))}</h3>
          <p>${escapeHtml(dueLabel(currentTicket))}</p>
        </div>
      </section>

      <div class="ticket-progress" aria-label="Ticket progress">
        ${progressMarkup(currentTicket)}
      </div>

      <div class="ticket-workspace-grid">
        <div class="ticket-workspace-main">
          <section class="ticket-panel">
            <div class="ticket-panel-label">AI summary</div>
            <h3>${escapeHtml(currentTicket.title)}</h3>
            <p>
              ${escapeHtml(
                currentTicket.description || "No description was provided."
              )}
            </p>
            <div class="ticket-summary-meta">
              <span><strong>Location:</strong> ${escapeHtml(currentTicket.location)}</span>
              <span><strong>Requester:</strong> ${escapeHtml(currentTicket.requester)}</span>
              <span><strong>Current owner:</strong> ${escapeHtml(currentTicket.assignee || "Unassigned")}</span>
            </div>
          </section>

          <section class="ticket-next-action-card">
            <div class="ticket-panel-label">Recommended next action</div>
            <strong>${escapeHtml(nextAction(currentTicket))}</strong>
          </section>

          ${managementPanel}

          <section class="ticket-panel">
            <div class="ticket-panel-label">Activity and conversation</div>
            <div class="ticket-activity-list">
              ${historyMarkup(currentTicket)}
            </div>
          </section>
        </div>

        <aside class="ticket-workspace-side">
          <section class="ticket-side-card ticket-impact-card">
            <div class="ticket-panel-label">Business impact</div>
            <p>${escapeHtml(businessImpact(currentTicket))}</p>
          </section>

          <section class="ticket-side-card">
            <div class="ticket-panel-label">Still needed</div>
            <ul class="ticket-info-list">
              ${missing
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}
            </ul>
          </section>

          <section class="ticket-side-card">
            <div class="ticket-panel-label">Suggested resolution path</div>
            <ol class="ticket-suggested-list">
              ${suggestions
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}
            </ol>
          </section>

          <details class="ticket-technical-details">
            <summary>Technical and routing details</summary>

            <div class="detail-grid">
              <div class="detail-cell">
                <small>Priority</small>
                <strong>
                  <span class="badge ${priorityClass(currentTicket.priority)}">
                    ${escapeHtml(currentTicket.priority)}
                  </span>
                </strong>
              </div>

              <div class="detail-cell">
                <small>Assigned team</small>
                <strong>${escapeHtml(currentTicket.queue)}</strong>
              </div>

              <div class="detail-cell">
                <small>Assignee</small>
                <strong>${escapeHtml(currentTicket.assignee || "Unassigned")}</strong>
              </div>

              <div class="detail-cell">
                <small>Requester</small>
                <strong>${escapeHtml(currentTicket.requester)}</strong>
              </div>

              <div class="detail-cell">
                <small>Location</small>
                <strong>${escapeHtml(currentTicket.location)}</strong>
              </div>

              <div class="detail-cell">
                <small>SLA due</small>
                <strong>${escapeHtml(formatDate(currentTicket.slaDueAt))}</strong>
              </div>
            </div>

            <div class="notice notice-info mt-12">
              <div>
                <strong>${escapeHtml(currentTicket.classificationConfidence)}% classification confidence</strong>
                <p>${escapeHtml(currentTicket.routingReason)}</p>
              </div>
            </div>
          </details>
        </aside>
      </div>
    `;

    const body = document.getElementById("sharedTicketBody");
    const noteInput = body.querySelector("#ticketUpdateText");

    body.querySelectorAll("[data-ticket-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.ticketAction;
        const note = noteInput ? noteInput.value.trim() : "";
        let updated = null;

        if (action === "assign") {
          updated = Store.updateTicket(
            ticketId,
            {
              assignee: Store.CURRENT_USER.name,
              status: currentTicket.status === "New"
                ? "In progress"
                : currentTicket.status
            },
            `Assigned to ${Store.CURRENT_USER.name}.`
          );
        }

        if (action === "start") {
          updated = Store.updateTicket(
            ticketId,
            {
              assignee: unassigned
                ? Store.CURRENT_USER.name
                : currentTicket.assignee,
              status: "In progress"
            },
            `${Store.CURRENT_USER.name} started work on the ticket.`
          );
        }

        if (action === "request-info") {
          if (!note) {
            showToast("Write the question or missing information before requesting a response.");
            noteInput.focus();
            return;
          }

          updated = Store.updateTicket(
            ticketId,
            { status: "Waiting on requester" },
            `${Store.CURRENT_USER.name} requested information: ${note}`
          );
        }

        if (action === "resolve") {
          updated = Store.updateTicket(
            ticketId,
            { status: "Resolved" },
            note
              ? `${Store.CURRENT_USER.name} resolved the ticket: ${note}`
              : `${Store.CURRENT_USER.name} resolved the ticket.`
          );
        }

        if (action === "reopen") {
          updated = Store.updateTicket(
            ticketId,
            {
              status: "In progress",
              assignee: unassigned
                ? Store.CURRENT_USER.name
                : currentTicket.assignee
            },
            `${Store.CURRENT_USER.name} reopened the ticket.`
          );
        }

        if (action === "post") {
          if (!note) {
            showToast("Write an update before posting.");
            noteInput.focus();
            return;
          }

          updated = Store.updateTicket(
            ticketId,
            {},
            `${Store.CURRENT_USER.name}: ${note}`
          );
        }

        if (action === "requester-reply") {
          if (!note) {
            showToast("Write a reply before sending.");
            noteInput.focus();
            return;
          }

          updated = Store.updateTicket(
            ticketId,
            {
              status: isWaiting(currentTicket)
                ? "In progress"
                : currentTicket.status
            },
            `${Store.CURRENT_USER.name} replied: ${note}`
          );
        }

        if (!updated) return;

        showToast(`${updated.number} updated.`);
        renderTicket(updated);
      });
    });
  }

  renderTicket(Store.getTicket(ticketId) || ticket);

  if (!dialog.open) {
    dialog.showModal();
  }
}

  const layoutReady = renderLayout();

  window.MasterFlowUI = {
    pages,
    currentPage,
    getRole,
    isAllowed,
    safeLanding,
    showToast,
    openCriticalDialog,
    openSidebar,
    closeSidebar,
    openTicketDialog,
    escapeHtml,
    formatDate,
    formatMoney,
    priorityClass,
    statusClass,
    layoutReady
  };
})();
