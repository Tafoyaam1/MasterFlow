(function () {
  "use strict";

  const Store = window.MasterFlowStore;
  const UI = window.MasterFlowUI;

  if (!Store || !UI || !UI.layoutReady) return;

  const FEEDBACK_KEY = "masterflowFlowFeedbackV1";
  const CLOSED_STATUSES = new Set(["Resolved", "Closed", "Cancelled"]);
  const FLOW_GAP_EXCLUSIONS = new Set(["Assigned owner", "Confirmed routing", "Requester response"]);
  const ISSUE_TYPES = new Set([
    "missing-information",
    "routing",
    "recognition",
    "question-wording",
    "receiver-brief",
    "other"
  ]);

  let feedbackContext = null;

  function cleanText(value) {
    return String(value == null ? "" : value).trim();
  }

  function readFeedback() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(FEEDBACK_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Receiver feedback was reset because it could not be read.", error);
      window.localStorage.removeItem(FEEDBACK_KEY);
      return [];
    }
  }

  function writeFeedback(items) {
    window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("masterflow:flow-feedback", { detail: items.slice() }));
    return items;
  }

  function feedbackId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `feedback-${window.crypto.randomUUID()}`;
    }
    return `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function addFeedback(input) {
    const sourceRole = input && input.sourceRole === "queue-manager" ? "queue-manager" : "resolver";
    const issueType = ISSUE_TYPES.has(input && input.issueType) ? input.issueType : "other";
    const evidence = input && input.evidence ? input.evidence : {};

    const item = {
      id: feedbackId(),
      createdAt: new Date().toISOString(),
      ticketId: cleanText(input && input.ticketId),
      templateId: cleanText(input && input.templateId),
      queue: cleanText(input && input.queue),
      submittedBy: cleanText(input && input.submittedBy) || Store.CURRENT_USER.name,
      sourceRole,
      issueType,
      title: cleanText(input && input.title),
      description: cleanText(input && input.description),
      suggestedChange: cleanText(input && input.suggestedChange),
      evidence: {
        missingFields: Array.isArray(evidence.missingFields)
          ? evidence.missingFields.map(cleanText).filter(Boolean)
          : [],
        phrase: cleanText(evidence.phrase),
        diagnosticId: cleanText(evidence.diagnosticId)
      },
      status: "new"
    };

    const items = readFeedback();
    items.unshift(item);
    writeFeedback(items);
    return item;
  }

  function isClosed(ticket) {
    return CLOSED_STATUSES.has(cleanText(ticket && ticket.status));
  }

  function isWaiting(ticket) {
    return /waiting on requester|waiting on employee/i.test(cleanText(ticket && ticket.status));
  }

  function minutesUntilDue(ticket) {
    const due = new Date(ticket && ticket.slaDueAt).getTime();
    if (!Number.isFinite(due)) return Number.POSITIVE_INFINITY;
    return Math.round((due - Date.now()) / 60000);
  }

  function isSlaRisk(ticket) {
    return !isClosed(ticket) && minutesUntilDue(ticket) <= 60;
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
    if (isClosed(ticket)) return `Completed ${formatExactDate(ticket.updatedAt)}`;
    const minutes = minutesUntilDue(ticket);
    if (!Number.isFinite(minutes)) return "No SLA set";
    if (minutes < -60) return `Overdue by ${Math.ceil(Math.abs(minutes) / 60)}h`;
    if (minutes < 0) return `Overdue by ${Math.abs(minutes)}m`;
    if (minutes <= 60) return `Due in ${Math.max(1, minutes)}m`;
    if (minutes < 1440) return `Due in ${Math.ceil(minutes / 60)}h`;
    return `Due ${formatExactDate(ticket.slaDueAt)}`;
  }

  function priorityLabel(priority) {
    const code = cleanText(priority).split(" - ")[0];
    const labels = { P1: "Critical", P2: "High", P3: "Normal", P4: "Low" };
    return labels[code] ? `${labels[code]} (${code})` : cleanText(priority) || "Normal";
  }

  function humanizeKey(key) {
    return cleanText(key)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function valueText(value) {
    if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    return cleanText(value);
  }

  function keyIdentifiers(ticket) {
    const identifiers = [];
    const excluded = new Set([
      "requestTemplateId",
      "requestTemplateName",
      "resolutionTargetHours",
      "requestedOutcome",
      "businessImpact",
      "safetyContainment",
      "containment",
      "observedSituation"
    ]);

    if (ticket.location && !/not provided|unknown/i.test(ticket.location)) {
      identifiers.push({ label: "Location", value: ticket.location });
    }

    Object.entries(ticket.details || {}).forEach(([key, value]) => {
      const text = valueText(value);
      if (!text || excluded.has(key)) return;
      identifiers.push({ label: humanizeKey(key), value: text });
    });

    return identifiers.slice(0, 8);
  }

  function informationGaps(ticket) {
    const gaps = [];
    const details = ticket.details || {};
    const text = `${ticket.title || ""} ${ticket.description || ""} ${ticket.category || ""}`.toLowerCase();

    if (!ticket.assignee || ticket.assignee === "Unassigned") gaps.push("Assigned owner");
    if (!ticket.location || /not provided|unknown/i.test(ticket.location)) gaps.push("Exact location");
    if (!ticket.description || cleanText(ticket.description).length < 20) gaps.push("Clear issue description");
    if (Number(ticket.classificationConfidence || 0) < 70 || /triage/i.test(ticket.queue || "")) gaps.push("Confirmed routing");
    if (isWaiting(ticket)) gaps.push("Requester response");

    if (/printer/.test(text) && !details.printer && !details.printerName && !details.printerNameOrIp) {
      gaps.push("Printer name, asset number, or IP");
    }
    if (/forklift|mhe|pallet jack|equipment out of service/.test(text) && !details.mheNumber && !details.assetNumber) {
      gaps.push("Equipment or MHE number");
    }
    if (/stock check|inventory verification/.test(text) && !details.partNumber) gaps.push("Part number");
    if (/systems intake|merp|oms|syq|edi|api/.test(text) && !details.system) gaps.push("Affected system");
    if (/\b(?:order|control|ctrl)(?:\s+number|\s*#|\s*:)/.test(text) && !details.orderNumber && !details.controlNumber && !details.pendingOrder) {
      gaps.push("Order or control number");
    }

    return [...new Set(gaps)];
  }

  function requestedOutcome(ticket) {
    const details = ticket.details || {};
    if (details.requestedOutcome) return valueText(details.requestedOutcome);

    const text = `${ticket.title || ""} ${ticket.category || ""}`.toLowerCase();
    if (/connect to printer|printer connectivity|cannot print|printer/.test(text)) {
      return "Restore reliable printing so the requester can continue the affected work.";
    }
    if (/access/.test(text)) return "Provide the approved system or report access needed for the requester to work.";
    if (/laptop performance|computer slow/.test(text)) return "Restore acceptable device performance for normal business work.";
    if (/manifest|shipping|warehouse operations outage|stopped/.test(text)) {
      return "Restore the blocked warehouse or shipping process and confirm operations are stable.";
    }
    if (/replacement|purchase/.test(text)) return "Complete the requested approval and provide the required replacement equipment.";
    if (/stock check/.test(text)) return "Verify the requested inventory facts and return a clear result to the requester.";
    return `Complete the requested outcome for: ${ticket.title || "this request"}.`;
  }

  function observedSituation(ticket) {
    const details = ticket.details || {};
    return valueText(details.observedSituation) || cleanText(ticket.description) || "No observed situation was captured.";
  }

  function scopeImpact(ticket) {
    const details = ticket.details || {};
    if (details.businessImpact) return valueText(details.businessImpact);

    const parts = [];
    if (details.affectedUsers) parts.push(`${valueText(details.affectedUsers)} affected`);
    if (details.process) parts.push(`${valueText(details.process)} process`);
    if (ticket.location && !/not provided|unknown/i.test(ticket.location)) parts.push(ticket.location);

    if (String(ticket.priority || "").startsWith("P1")) {
      parts.unshift("Critical operations may be blocked");
    } else if (isWaiting(ticket)) {
      parts.unshift("Resolution is blocked until the requester responds");
    } else if (ticket.status === "Approval required") {
      parts.unshift("Work is waiting on an authorized decision");
    } else {
      parts.unshift("Active business work is affected");
    }

    return `${parts.join(". ")}.`;
  }

  function safetyContainment(ticket) {
    const details = ticket.details || {};
    if (details.safetyContainment) return valueText(details.safetyContainment);
    if (details.containment) return valueText(details.containment);

    const text = `${ticket.title || ""} ${ticket.description || ""} ${ticket.category || ""}`.toLowerCase();
    if (/forklift|mhe|pallet jack|equipment out of service/.test(text)) {
      return "Keep the equipment out of service and tagged until an authorized person clears it.";
    }
    if (String(ticket.priority || "").startsWith("P1") || /shipping is stopped|manifest/.test(text)) {
      return "Maintain the current operational containment and follow the P1 escalation path until service is restored.";
    }
    return "No special safety or containment requirement has been recorded.";
  }

  function suggestedFirstAction(ticket, gaps) {
    const text = `${ticket.title || ""} ${ticket.description || ""} ${ticket.category || ""}`.toLowerCase();

    if (isClosed(ticket)) return "Review the recorded resolution and reopen only if the issue returns.";
    if (String(ticket.priority || "").startsWith("P1")) {
      return "Confirm the full operational scope, claim ownership, and begin the critical response immediately.";
    }
    if (!ticket.assignee || ticket.assignee === "Unassigned") return "Claim the ticket or assign the best available owner.";
    if (ticket.status === "Triage") return "Confirm the correct queue and owner before normal work begins.";
    if (isWaiting(ticket)) return "Review the latest request for information and send a reminder if the response is overdue.";
    if (gaps.length) return `Close the highest-impact information gap first: ${gaps[0]}.`;
    if (/printer/.test(text)) return "Verify printer power, network availability, and the stored printer name or IP.";
    if (/access/.test(text)) return "Validate the requested access, business reason, and approval path.";
    if (/laptop performance|computer slow/.test(text)) return "Confirm affected applications, recent restart status, and current CPU or memory pressure.";
    if (/stock check/.test(text)) return "Verify the exact part number and requested check type before dispatching the warehouse task.";
    return "Review the receiver brief, confirm ownership, and begin the next available work step.";
  }

  function analyzeTicket(ticket) {
    const gaps = informationGaps(ticket);
    const identifiers = keyIdentifiers(ticket);
    const routingReady = Number(ticket.classificationConfidence || 0) >= 70 && !/triage/i.test(ticket.queue || "");

    let workLabel = "Ready to work";
    let workClass = "badge-green";
    let workDetail = "The receiver can begin without waiting on another person.";

    if (isClosed(ticket)) {
      workLabel = "Completed";
      workClass = "badge-green";
      workDetail = "The ticket has a recorded completion state.";
    } else if (isWaiting(ticket)) {
      workLabel = "Blocked on requester";
      workClass = "badge-amber";
      workDetail = "The receiver is waiting for employee information.";
    } else if (!ticket.assignee || ticket.assignee === "Unassigned") {
      workLabel = "Needs owner";
      workClass = "badge-amber";
      workDetail = "The ticket cannot progress consistently until ownership is assigned.";
    } else if (gaps.some((gap) => !["Assigned owner", "Confirmed routing"].includes(gap))) {
      workLabel = "Needs information";
      workClass = "badge-amber";
      workDetail = "One or more operational facts are still missing.";
    }

    return {
      requestedOutcome: requestedOutcome(ticket),
      observedSituation: observedSituation(ticket),
      scopeImpact: scopeImpact(ticket),
      identifiers,
      safetyContainment: safetyContainment(ticket),
      gaps,
      suggestedFirstAction: suggestedFirstAction(ticket, gaps),
      routingReadiness: {
        label: routingReady ? "Routing ready" : "Routing review needed",
        className: routingReady ? "badge-green" : "badge-amber",
        detail: routingReady
          ? "The current queue is supported by the recorded classification confidence."
          : "The route should be confirmed before relying on normal queue ownership."
      },
      workReadiness: {
        label: workLabel,
        className: workClass,
        detail: workDetail
      },
      dueLabel: dueLabel(ticket),
      priorityLabel: priorityLabel(ticket)
    };
  }

  function ensureFeedbackDialog() {
    let dialog = document.getElementById("receiverFeedbackDialog");
    if (dialog) return dialog;

    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="receiverFeedbackDialog" class="receiver-feedback-dialog" aria-labelledby="receiverFeedbackTitle">
        <form id="receiverFeedbackForm">
          <div class="dialog-header">
            <div>
              <h2 id="receiverFeedbackTitle">Suggest a flow improvement</h2>
              <p>Capture receiver evidence without changing routing or template logic in this workstream.</p>
            </div>
            <button class="close-button" type="button" data-close-receiver-feedback aria-label="Close">x</button>
          </div>
          <div class="dialog-body">
            <div class="field-row">
              <div class="field">
                <label for="receiverFeedbackType">Issue type</label>
                <select class="select" id="receiverFeedbackType" required>
                  <option value="missing-information">Missing information</option>
                  <option value="routing">Routing</option>
                  <option value="recognition">Recognition</option>
                  <option value="question-wording">Question wording</option>
                  <option value="receiver-brief">Receiver brief</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="field">
                <label for="receiverFeedbackTitleInput">Title</label>
                <input class="input" id="receiverFeedbackTitleInput" required>
              </div>
            </div>
            <div class="field mt-12">
              <label for="receiverFeedbackDescription">What happened?</label>
              <textarea class="textarea" id="receiverFeedbackDescription" required></textarea>
            </div>
            <div class="field mt-12">
              <label for="receiverFeedbackSuggestedChange">Suggested change</label>
              <textarea class="textarea" id="receiverFeedbackSuggestedChange"></textarea>
            </div>
            <div class="field-row mt-12">
              <div class="field">
                <label for="receiverFeedbackMissingFields">Missing fields</label>
                <input class="input" id="receiverFeedbackMissingFields" placeholder="Comma-separated">
              </div>
              <div class="field">
                <label for="receiverFeedbackDiagnosticId">Diagnostic ID</label>
                <input class="input" id="receiverFeedbackDiagnosticId" placeholder="Optional">
              </div>
            </div>
            <div class="field mt-12">
              <label for="receiverFeedbackPhrase">Evidence phrase</label>
              <input class="input" id="receiverFeedbackPhrase" placeholder="Original wording or recurring phrase">
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" type="button" data-close-receiver-feedback>Cancel</button>
            <button class="btn btn-primary" type="submit">Save feedback</button>
          </div>
        </form>
      </dialog>
    `);

    dialog = document.getElementById("receiverFeedbackDialog");
    const form = document.getElementById("receiverFeedbackForm");

    dialog.querySelectorAll("[data-close-receiver-feedback]").forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity() || !feedbackContext) return;

      const missingFields = document.getElementById("receiverFeedbackMissingFields").value
        .split(",")
        .map(cleanText)
        .filter(Boolean);

      const item = addFeedback({
        ticketId: feedbackContext.ticketId,
        templateId: feedbackContext.templateId,
        queue: feedbackContext.queue,
        submittedBy: Store.CURRENT_USER.name,
        sourceRole: feedbackContext.sourceRole,
        issueType: document.getElementById("receiverFeedbackType").value,
        title: document.getElementById("receiverFeedbackTitleInput").value,
        description: document.getElementById("receiverFeedbackDescription").value,
        suggestedChange: document.getElementById("receiverFeedbackSuggestedChange").value,
        evidence: {
          missingFields,
          phrase: document.getElementById("receiverFeedbackPhrase").value,
          diagnosticId: document.getElementById("receiverFeedbackDiagnosticId").value
        }
      });

      dialog.close();
      form.reset();
      feedbackContext = null;
      UI.showToast(`Feedback saved: ${item.title}`);
    });

    return dialog;
  }

  function openFeedback(context) {
    const dialog = ensureFeedbackDialog();
    feedbackContext = {
      ticketId: cleanText(context && context.ticketId),
      templateId: cleanText(context && context.templateId),
      queue: cleanText(context && context.queue),
      sourceRole: context && context.sourceRole === "queue-manager" ? "queue-manager" : "resolver"
    };

    document.getElementById("receiverFeedbackType").value = ISSUE_TYPES.has(context && context.issueType)
      ? context.issueType
      : "other";
    document.getElementById("receiverFeedbackTitleInput").value = cleanText(context && context.title);
    document.getElementById("receiverFeedbackDescription").value = cleanText(context && context.description);
    document.getElementById("receiverFeedbackSuggestedChange").value = cleanText(context && context.suggestedChange);
    document.getElementById("receiverFeedbackMissingFields").value = Array.isArray(context && context.missingFields)
      ? context.missingFields.join(", ")
      : "";
    document.getElementById("receiverFeedbackPhrase").value = cleanText(context && context.phrase);
    document.getElementById("receiverFeedbackDiagnosticId").value = cleanText(context && context.diagnosticId);

    if (!dialog.open) dialog.showModal();
  }

  function readinessForQueue(ticket) {
    const analysis = analyzeTicket(ticket);
    return analysis.workReadiness.label === "Ready to work";
  }

  function queueRecommendation(activeTickets) {
    const gapCounts = new Map();
    const gapQueues = new Map();

    activeTickets.forEach((ticket) => {
      analyzeTicket(ticket).gaps.filter((gap) => !FLOW_GAP_EXCLUSIONS.has(gap)).forEach((gap) => {
        gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
        if (!gapQueues.has(gap)) gapQueues.set(gap, new Map());
        const queueMap = gapQueues.get(gap);
        queueMap.set(ticket.queue, (queueMap.get(ticket.queue) || 0) + 1);
      });
    });

    const top = [...gapCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) {
      return {
        title: "Maintain the current request-flow design",
        description: "No repeated information gap is visible in the current prototype data.",
        suggestedChange: "Continue monitoring receiver feedback before changing a request flow.",
        gap: "",
        queue: "",
        count: 0
      };
    }

    const gap = top[0];
    const count = top[1];
    const queueEntries = [...gapQueues.get(gap).entries()].sort((a, b) => b[1] - a[1]);
    const queue = queueEntries.length ? queueEntries[0][0] : "the affected queue";

    return {
      title: `Collect ${gap.toLowerCase()} earlier`,
      description: `${count} active ticket${count === 1 ? "" : "s"} currently lack ${gap.toLowerCase()}, with the largest impact in ${queue}.`,
      suggestedChange: `Add or improve a plain-language intake question that captures ${gap.toLowerCase()} before submission, while keeping a safe fallback for genuinely unknown information.`,
      gap,
      queue,
      count
    };
  }

  function initQueueManager() {
    if (document.body.dataset.page !== "ticket-queues") return;

    const activeVolume = document.getElementById("qmActiveVolume");
    const slaRisk = document.getElementById("qmSlaRisk");
    const unassigned = document.getElementById("qmUnassigned");
    const readinessRate = document.getElementById("qmReadinessRate");
    const queueBody = document.getElementById("qmQueueBody");
    const workloadBody = document.getElementById("qmWorkloadBody");
    const coverageList = document.getElementById("qmCoverageList");
    const gapList = document.getElementById("qmGapList");
    const waitingList = document.getElementById("qmWaitingList");
    const waitingCount = document.getElementById("qmWaitingCount");
    const recommendationPanel = document.getElementById("qmRecommendation");
    const feedbackList = document.getElementById("qmFeedbackList");
    let currentRecommendation = null;

    function renderQueueManager() {
      const tickets = Store.getState().tickets.slice();
      const active = tickets.filter((ticket) => !isClosed(ticket));
      const ready = active.filter(readinessForQueue);
      const waiting = active.filter(isWaiting);
      const risk = active.filter(isSlaRisk);
      const noOwner = active.filter((ticket) => !ticket.assignee || ticket.assignee === "Unassigned");

      activeVolume.textContent = String(active.length);
      slaRisk.textContent = String(risk.length);
      unassigned.textContent = String(noOwner.length);
      readinessRate.textContent = `${active.length ? Math.round((ready.length / active.length) * 100) : 100}%`;
      waitingCount.textContent = `${waiting.length} waiting`;

      const queueNames = [...new Set(active.map((ticket) => ticket.queue))].sort();
      queueBody.innerHTML = queueNames.length
        ? queueNames.map((queue) => {
            const items = active.filter((ticket) => ticket.queue === queue);
            return `
              <tr>
                <td><strong>${UI.escapeHtml(queue)}</strong></td>
                <td>${items.length}</td>
                <td>${items.filter(readinessForQueue).length}</td>
                <td>${items.filter(isWaiting).length}</td>
                <td>${items.filter((ticket) => !ticket.assignee || ticket.assignee === "Unassigned").length}</td>
                <td>${items.filter(isSlaRisk).length}</td>
              </tr>
            `;
          }).join("")
        : '<tr><td colspan="6"><div class="empty-state">No active queue work.</div></td></tr>';

      const ownerNames = [...new Set(active.map((ticket) => ticket.assignee || "Unassigned"))].sort();
      workloadBody.innerHTML = ownerNames.length
        ? ownerNames.map((owner) => {
            const items = active.filter((ticket) => (ticket.assignee || "Unassigned") === owner);
            const highImpact = items.filter((ticket) => /^P1|^P2/.test(ticket.priority || "")).length;
            return `
              <tr>
                <td><strong>${UI.escapeHtml(owner)}</strong></td>
                <td>${items.length}</td>
                <td>${highImpact}</td>
                <td>${items.filter(isWaiting).length}</td>
                <td>${items.filter(isSlaRisk).length}</td>
              </tr>
            `;
          }).join("")
        : '<tr><td colspan="5"><div class="empty-state">No active owner workload.</div></td></tr>';

      const coverage = queueNames.map((queue) => {
        const items = active.filter((ticket) => ticket.queue === queue);
        const owners = [...new Set(items.map((ticket) => ticket.assignee).filter((owner) => owner && owner !== "Unassigned"))];
        const unassignedCount = items.filter((ticket) => !ticket.assignee || ticket.assignee === "Unassigned").length;
        let message = "Coverage appears balanced for current prototype volume.";
        let tone = "good";
        if (!owners.length) {
          message = "No active owner is recorded for this queue.";
          tone = "danger";
        } else if (unassignedCount) {
          message = `${unassignedCount} ticket${unassignedCount === 1 ? "" : "s"} need ownership.`;
          tone = "warn";
        } else if (items.length >= 3 && owners.length === 1) {
          message = "All active work depends on one owner.";
          tone = "warn";
        }
        return { queue, message, tone, owners: owners.length };
      }).filter((item) => item.tone !== "good");

      coverageList.innerHTML = coverage.length
        ? coverage.map((item) => `
            <div class="manager-insight manager-insight-${item.tone}">
              <strong>${UI.escapeHtml(item.queue)}</strong>
              <p>${UI.escapeHtml(item.message)}</p>
            </div>
          `).join("")
        : '<div class="notice notice-success"><div><strong>No immediate coverage gap</strong><p>Every visible queue has an active owner and no unassigned work.</p></div></div>';

      const gapCounts = new Map();
      active.forEach((ticket) => {
        analyzeTicket(ticket).gaps.filter((gap) => !FLOW_GAP_EXCLUSIONS.has(gap)).forEach((gap) => gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1));
      });
      const gaps = [...gapCounts.entries()].sort((a, b) => b[1] - a[1]);
      gapList.innerHTML = gaps.length
        ? gaps.slice(0, 6).map(([gap, count]) => `
            <div class="manager-insight">
              <strong>${UI.escapeHtml(gap)}</strong>
              <p>${count} active ticket${count === 1 ? "" : "s"} require follow-up or confirmation.</p>
            </div>
          `).join("")
        : '<div class="notice notice-success"><div><strong>No repeated information gap</strong><p>Current active tickets contain the core information receivers need.</p></div></div>';

      waitingList.innerHTML = waiting.length
        ? waiting.slice(0, 8).map((ticket) => `
            <article class="manager-ticket-item">
              <div>
                <strong>${UI.escapeHtml(ticket.number)} - ${UI.escapeHtml(ticket.title)}</strong>
                <p>${UI.escapeHtml(ticket.queue)} · ${UI.escapeHtml(ticket.requester)} · ${UI.escapeHtml(dueLabel(ticket))}</p>
              </div>
              <button class="btn btn-secondary btn-sm" type="button" data-qm-ticket="${UI.escapeHtml(ticket.id)}">Open in Work Center</button>
            </article>
          `).join("")
        : '<div class="empty-state">No tickets are waiting on a requester.</div>';

      currentRecommendation = queueRecommendation(active);
      recommendationPanel.innerHTML = `
        <div class="queue-recommendation-icon">i</div>
        <div>
          <h3>${UI.escapeHtml(currentRecommendation.title)}</h3>
          <p>${UI.escapeHtml(currentRecommendation.description)}</p>
          <strong>${UI.escapeHtml(currentRecommendation.suggestedChange)}</strong>
        </div>
      `;

      const feedback = readFeedback();
      feedbackList.innerHTML = feedback.length
        ? feedback.slice(0, 10).map((item) => `
            <article class="feedback-item">
              <div>
                <span class="badge badge-gray">${UI.escapeHtml(item.issueType)}</span>
                <strong>${UI.escapeHtml(item.title)}</strong>
                <p>${UI.escapeHtml(item.description)}</p>
              </div>
              <small>${UI.escapeHtml(item.sourceRole)} · ${UI.escapeHtml(formatExactDate(item.createdAt))}</small>
            </article>
          `).join("")
        : '<div class="empty-state">No receiver or manager feedback has been submitted yet.</div>';
    }

    waitingList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-qm-ticket]");
      if (!button) return;
      window.localStorage.setItem("masterflowReceiverOpenTicket", button.dataset.qmTicket);
      window.location.href = "assigned-work.html";
    });

    document.getElementById("qmSubmitRecommendation").addEventListener("click", () => {
      if (!currentRecommendation) return;
      openFeedback({
        sourceRole: "queue-manager",
        queue: currentRecommendation.queue,
        issueType: currentRecommendation.gap ? "question-wording" : "other",
        title: currentRecommendation.title,
        description: currentRecommendation.description,
        suggestedChange: currentRecommendation.suggestedChange,
        missingFields: currentRecommendation.gap ? [currentRecommendation.gap] : []
      });
    });

    document.getElementById("qmAddFeedback").addEventListener("click", () => {
      openFeedback({ sourceRole: "queue-manager", issueType: "other" });
    });

    window.addEventListener("masterflow:state", renderQueueManager);
    window.addEventListener("masterflow:flow-feedback", renderQueueManager);
    renderQueueManager();
  }

  window.MasterFlowReceiverFeedback = {
    STORAGE_KEY: FEEDBACK_KEY,
    list: readFeedback,
    add: addFeedback,
    open: openFeedback,
    analyzeTicket,
    isClosed,
    isWaiting,
    isSlaRisk,
    dueLabel,
    priorityLabel
  };

  initQueueManager();
})();
