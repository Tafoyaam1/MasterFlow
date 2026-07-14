(function () {
  "use strict";

  const Store = window.MasterFlowStore;
  const Templates = window.MasterFlowTemplates;
  const Engine =
    window.MasterFlowRequestEngine;
  const UI = window.MasterFlowUI;

  const missingDependencies = [
    !Store && "MasterFlowStore",
    !Templates && "MasterFlowTemplates",
    !Engine && "MasterFlowRequestEngine",
    !UI && "MasterFlowUI",
    UI && !UI.layoutReady &&
      "MasterFlowUI.layoutReady"
  ].filter(Boolean);

  if (missingDependencies.length) {
    console.error(
      "MasterFlow home.js did not start. Missing:",
      missingDependencies.join(", ")
    );

    return;
  }

  const askInput =
    document.getElementById("askInput");

  const askButton =
    document.getElementById("askButton");

  const attachButton =
    document.getElementById("attachButton");

  const suggestions =
    document.getElementById(
      "requestSuggestions"
    );

  const criticalHomeButton =
    document.getElementById(
      "criticalHomeButton"
    );

  const chatPanel =
    document.getElementById("chatPanel");

  const chatBody =
    document.getElementById("chatBody");

  const chatStatus = chatPanel
    ? chatPanel.querySelector(".chat-status")
    : null;

  const DRAFT_KEY =
    "masterflowSmartDraft";

  if (
    !askInput ||
    !askButton ||
    !chatPanel ||
    !chatBody
  ) {
    return;
  }

  const DEFAULT_PLACEHOLDER =
    askInput.getAttribute("placeholder") ||
    "Describe what you need help with";

  let activeAnalysis = null;
  let pendingQuestion = null;

  function escape(value) {
    return UI.escapeHtml(
      String(value ?? "")
    );
  }

  function closeSuggestions() {
    if (!suggestions) return;

    suggestions.classList.remove("open");
    suggestions.innerHTML = "";
  }

  function setStatus(text) {
    if (chatStatus) {
      chatStatus.textContent = text;
    }
  }

  function openChat() {
    chatPanel.classList.add("open");
  }

  function scrollChat() {
    window.setTimeout(() => {
      chatBody.scrollTop =
        chatBody.scrollHeight;

      chatPanel.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    }, 40);
  }

  function appendBubble(kind, html) {
    chatBody.insertAdjacentHTML(
      "beforeend",
      `<div class="bubble ${kind}">${html}</div>`
    );

    scrollChat();
  }

  function priorityOf(result) {
    if (
      result.priority &&
      result.priority.value
    ) {
      return result.priority.value;
    }

    if (
      result.requestPlan &&
      result.requestPlan.priority
    ) {
      return result.requestPlan.priority;
    }

    return result.template
      ? result.template.priority
      : "P3 - Normal";
  }
  function updateUnderstanding(result) {
    const setText = (id, value) => {
      const element =
        document.getElementById(id);

      if (element) {
        element.textContent = value;
      }
    };

    const progress =
      document.getElementById(
        "understandingProgress"
      );

    if (
      !result ||
      !result.template
    ) {
      setText(
        "understandingPercent",
        "0%"
      );

      setText(
        "understandingRequest",
        "Not determined yet"
      );

      setText(
        "understandingRoute",
        "Pending"
      );

      setText(
        "understandingPriority",
        "Pending"
      );

      setText(
        "understandingConfidence",
        "0%"
      );

      setText(
        "understandingCollected",
        "0 of 0"
      );

      setText(
        "understandingNeeded",
        "Describe your request"
      );

      setText(
        "understandingImpact",
        "MasterFlow will summarize the impact here."
      );

      if (progress) {
        progress.style.width = "0%";

        progress.parentElement
          ?.setAttribute(
            "aria-valuenow",
            "0"
          );
      }

      return;
    }

    const routing =
      result.routingReadiness || {
        answered: 0,
        total: 0,
        score: 0
      };

    const work =
      result.workReadiness || {
        answered: 0,
        total: 0,
        score: 0
      };

    const answered =
      Number(
        routing.answered || 0
      ) +
      Number(
        work.answered || 0
      );

    const total =
      Number(
        routing.total || 0
      ) +
      Number(
        work.total || 0
      );

    const percentage = total
      ? Math.round(
          (answered / total) * 100
        )
      : 100;

    const nextQuestion =
      result
        .clarificationQuestions?.[0];

    setText(
      "understandingPercent",
      `${percentage}%`
    );

    setText(
      "understandingRequest",
      result.template.name
    );

    setText(
      "understandingRoute",
      result.requestPlan?.queue ||
      result.template.queue
    );

    setText(
      "understandingPriority",
      result.priority?.value ||
      result.requestPlan?.priority ||
      result.template.priority
    );

    setText(
      "understandingConfidence",
      `${result.confidence || 0}%`
    );

    setText(
      "understandingCollected",
      `${answered} of ${total}`
    );

    setText(
      "understandingNeeded",
      nextQuestion
        ? nextQuestion.label
        : "Complete"
    );

    setText(
      "understandingImpact",
      result.businessImpact ||
      "Business impact will be confirmed during review."
    );

    if (progress) {
      progress.style.width =
        `${percentage}%`;

      progress.parentElement
        ?.setAttribute(
          "aria-valuenow",
          String(percentage)
        );
    }
  }
  function renderInterpretation(result) {
    const template = result.template;

    const queue =
      (result.requestPlan &&
        result.requestPlan.queue) ||
      template.queue;

    appendBubble(
      "ai",
      `<strong>Here is what I understood.</strong>

       <div class="ai-summary">
         <div class="summary-cell">
           <small>Request</small>
           <b>${escape(template.name)}</b>
         </div>

         <div class="summary-cell">
           <small>Route</small>
           <b>${escape(queue)}</b>
         </div>

         <div class="summary-cell">
           <small>Priority</small>
           <b>${escape(priorityOf(result))}</b>
         </div>

         <div class="summary-cell">
           <small>Confidence</small>
           <b>${escape(result.confidence)}%</b>
         </div>
       </div>

       <div>
         <strong>Likely impact</strong>
         ${escape(result.businessImpact)}
       </div>`
    );
  }

  function renderKnowledgeRecommendation(
    result
  ) {
    const article =
      result.knowledgeArticles &&
      result.knowledgeArticles[0];

    if (!article) return;

    appendBubble(
      "ai",
      `<strong>Helpful article</strong>
       <div><b>${escape(article.title)}</b></div>
       <div>${escape(article.summary)}</div>`
    );
  }

  function questionOptions(question) {
    return (question.options || [])
      .filter(Boolean)
      .filter(
        (option) => !/shipping/i.test(option)
      )
      .slice(0, 8);
  }

  function askClarification(result) {
    pendingQuestion =
      result.clarificationQuestions[0];

    const options =
      questionOptions(
        pendingQuestion
      );

    const optionButtons =
      options.length
        ? `<div class="chat-actions">${options
            .map(
              (option) =>
                `<button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  data-clarification-answer="${escape(
                    option
                  )}"
                >${escape(option)}</button>`
            )
            .join("")}</div>`
        : "";

    const heading =
      pendingQuestion.kind ===
      "diagnostic"
        ? "One question to make this work-ready"
        : "One detail to route this correctly";

    const reason =
      pendingQuestion.why
        ? `<small class="muted">
             Why I’m asking:
             ${escape(
               pendingQuestion.why
             )}
           </small>`
        : "";

    appendBubble(
      "ai",
      `<strong>${escape(
        heading
      )}</strong>

       <div>${escape(
         pendingQuestion.question
       )}</div>

       ${reason}
       ${optionButtons}`
    );

    askInput.value = "";

    askInput.placeholder =
      pendingQuestion.question;

    askInput.setAttribute(
      "aria-label",
      pendingQuestion.question
    );

    askButton.setAttribute(
      "aria-label",
      "Send answer"
    );

    setStatus(
      pendingQuestion.requiredFor ===
      "work"
        ? "● Gathering work details"
        : "● Gathering routing details"
    );

    askInput.focus();
  }

  function resetComposer() {
    askInput.placeholder =
      DEFAULT_PLACEHOLDER;

    askInput.setAttribute(
      "aria-label",
      "Describe what you need"
    );

    askButton.setAttribute(
      "aria-label",
      "Start request"
    );
  }

  function saveDraft(result) {
    const template = result.template;

    const suggestedTemplate =
      result.suggestedTemplate ||
      template;

    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        /*
         * Keep the employee's original request clean
         * for display in the Smart Request Builder.
         */
        text:
          result.initialText ||
          result.originalText,

        /*
         * Keep the expanded conversation separately.
         */
        conversationText:
          result.originalText,

        templateId: template.id,

        suggestedTemplateId:
          suggestedTemplate.id,

        confidence: result.confidence,

        threshold:
          result.confidenceThreshold,

        reason:
          result.classificationReason,

        manual: false,

        extractedFields:
          result.extractedFields,

        extractionDetails:
          result.extractionDetails,

        fieldAnswers:
          result.fieldAnswers || {},

        diagnosticAnswers:
          result.diagnosticAnswers || {},

        diagnosticDetails:
          result.diagnosticDetails || {},

        routingReadiness:
          result.routingReadiness,

        workReadiness:
          result.workReadiness,

        receiverBrief:
          result.receiverBrief,

        evidence:
          result.evidence || [],

        assistantResponse:
          result.assistantResponse,

        reportingData:
          result.reportingData,

        clarificationCount:
          result.clarificationCount || 0,

        priorityRecommendation:
          result.priority,

        businessImpact:
          result.businessImpact,

        requestPlan:
          result.requestPlan
      })
    );

    window.location.href =
      "smart-request.html";
  }

  function showReadyForReview(result) {
    pendingQuestion = null;
    resetComposer();

    const message =
      result.template.id ===
      "general-triage"
        ? "I prepared a general request. Business Enablement will confirm the correct route without asking you to start over."
        : `I have everything required for the ${result.template.name} request.`;

    appendBubble(
      "ai",
      `<strong>Your Smart Request is ready.</strong>

       <div>${escape(message)}</div>

       <div class="chat-actions">
         <button
           class="btn btn-primary btn-sm"
           type="button"
           data-review-request
         >
           Review Smart Request
         </button>

         <button
           class="btn btn-secondary btn-sm"
           type="button"
           data-start-over
         >
           Start over
         </button>
       </div>`
    );

    setStatus("● Ready for review");
  }

  function startAnalysis(text) {
    closeSuggestions();
    setStatus("● Analyzing request");

    let result;

    try {
      result = Engine.analyze(text);
    } catch (error) {
      console.error(
        "MasterFlow request analysis failed",
        error
      );

      UI.showToast(
        "MasterFlow could not analyze that request."
      );

      return;
    }

    if (!result || !result.ok) {
      askInput.focus();

      UI.showToast(
        (result && result.error) ||
          "Describe what you need before continuing."
      );

      return;
    }

    /*
     * Shipping stopped always bypasses
     * the conversational AI flow.
     */
    if (result.requiresP1) {
      activeAnalysis = null;
      pendingQuestion = null;
      resetComposer();
      UI.openCriticalDialog();
      return;
    }

    activeAnalysis = result;
    pendingQuestion = null;

    chatBody.innerHTML = "";
    openChat();
updateUnderstanding(result);
    appendBubble(
      "user",
      escape(text)
    );

    renderInterpretation(result);

    renderKnowledgeRecommendation(
      result
    );

    if (
      result.clarificationQuestions.length
    ) {
      askClarification(result);
    } else {
      showReadyForReview(result);
    }
  }

  function submitClarification(answer) {
    if (
      !activeAnalysis ||
      !pendingQuestion
    ) {
      return;
    }

    const question = pendingQuestion;

    pendingQuestion = null;
    closeSuggestions();
    askInput.value = "";

    appendBubble(
      "user",
      escape(answer)
    );

    setStatus("● Updating request");

    let result;

    try {
      result = Engine.continueAnalysis(
        activeAnalysis,
        question.fieldId,
        answer
      );
    } catch (error) {
      console.error(
        "MasterFlow clarification failed",
        error
      );

      UI.showToast(
        "MasterFlow could not save that answer."
      );

      pendingQuestion = question;
      askInput.focus();
      return;
    }

    if (result.requiresP1) {
      activeAnalysis = null;
      pendingQuestion = null;
      resetComposer();
      updateUnderstanding(result);
      UI.openCriticalDialog();
      return;
    }

    activeAnalysis = result;

    updateUnderstanding(result);

    if (
      result.answerAccepted === false
    ) {
      appendBubble(
        "ai",
        `<strong>I need a more exact location.</strong>

         <div>${escape(
           result.validationMessage ||
           "Please provide the exact station, line, door, or printer."
         )}</div>`
      );

      if (
        result.clarificationQuestions.length
      ) {
        askClarification(result);
      }

      return;
    }

    appendBubble(
      "ai",
      `<strong>Got it.</strong>

       <div>
         I added ${escape(answer)}
         for ${escape(question.label)}.
       </div>`
    );

    if (
      result.clarificationQuestions.length
    ) {
      askClarification(result);
    } else {
      showReadyForReview(result);
    }
  }

  function resetConversation() {
    activeAnalysis = null;
    pendingQuestion = null;

    chatBody.innerHTML = "";
    chatPanel.classList.remove("open");
        updateUnderstanding(null);

    askInput.value = "";

    resetComposer();
    setStatus("● Ready");

    askInput.focus();
  }

  function continueRequest() {
    const text = askInput.value.trim();

    if (!text) {
      askInput.focus();

      UI.showToast(
        pendingQuestion
          ? "Enter an answer before continuing."
          : "Describe what you need before continuing."
      );

      return;
    }

    if (pendingQuestion) {
      submitClarification(text);
      return;
    }

    startAnalysis(text);
  }

  function renderSuggestions() {
    if (!suggestions) return;

    /*
     * Template suggestions should not appear while
     * the employee is answering a question.
     */
    if (pendingQuestion) {
      closeSuggestions();
      return;
    }

    const text = askInput.value.trim();

    if (text.length < 2) {
      closeSuggestions();
      return;
    }

    const classification =
      Templates.classify(text);

    const ranked =
      classification.ranked
        .filter(
          (item) => item.score > 0
        )
        .slice(0, 3);

    const choices = ranked.length
      ? ranked
      : [
          {
            template:
              Templates.get(
                "general-triage"
              ),
            score: 0
          }
        ];

    suggestions.innerHTML =
      `<div class="suggestion-label">
        Suggested existing requests
       </div>` +
      choices
        .map(
          ({ template }) => `
            <button
              class="suggestion-item"
              type="button"
              data-template-id="${escape(
                template.id
              )}"
            >
              <span>
                <strong>${escape(
                  template.name
                )}</strong>

                <small>${escape(
                  template.description
                )}</small>
              </span>

              <span>${escape(
                template.queue
              )}</span>
            </button>`
        )
        .join("");

    suggestions.classList.add("open");
  }

  askButton.addEventListener(
    "click",
    continueRequest
  );

  askInput.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        continueRequest();
      }
    }
  );

  askInput.addEventListener(
    "input",
    renderSuggestions
  );

  /*
   * A suggestion helps phrase the request,
   * but the Request Engine still makes the
   * final classification decision.
   */
  if (suggestions) {
    suggestions.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            "[data-template-id]"
          );

        if (!button) return;

        const template =
          Templates.get(
            button.dataset.templateId
          );

        const text =
          askInput.value.trim() ||
          `Create a ${template.name}`;

        askInput.value = text;
        startAnalysis(text);
      }
    );
  }

  chatBody.addEventListener(
    "click",
    (event) => {
      const optionButton =
        event.target.closest(
          "[data-clarification-answer]"
        );

      if (optionButton) {
        submitClarification(
          optionButton.dataset
            .clarificationAnswer
        );

        return;
      }

      if (
        event.target.closest(
          "[data-review-request]"
        )
      ) {
        if (activeAnalysis) {
          saveDraft(activeAnalysis);
        }

        return;
      }

      if (
        event.target.closest(
          "[data-start-over]"
        )
      ) {
        resetConversation();
      }
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        !event.target.closest(
          "#requestComposer, .request-composer"
        )
      ) {
        closeSuggestions();
      }
    }
  );

  document
    .querySelectorAll("[data-example]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          askInput.value =
            button.dataset.example;

          askInput.focus();
          renderSuggestions();
        }
      );
    });

  if (attachButton) {
    attachButton.addEventListener(
      "click",
      () =>
        UI.showToast(
          "Attachments are added after MasterFlow prepares the Smart Request."
        )
    );
  }

  if (criticalHomeButton) {
    criticalHomeButton.addEventListener(
      "click",
      UI.openCriticalDialog
    );
  }

  const prefill =
    window.localStorage.getItem(
      "masterflowHomePrefill"
    );

  if (prefill) {
    window.localStorage.removeItem(
      "masterflowHomePrefill"
    );

    askInput.value = prefill;
    askInput.focus();
    renderSuggestions();
  }
})();