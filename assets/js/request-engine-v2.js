(function () {
  "use strict";

  const Base = window.MasterFlowRequestEngine;
  const Templates = window.MasterFlowTemplates;

  if (!Base || !Templates) {
    throw new Error(
      "request-engine-v2.js must load after templates.js and request-engine.js"
    );
  }

  const PROFILE_FIELDS = new Set([
    "requestedFor"
  ]);

  const SKIP_FIELDS = new Set([
    "attachments"
  ]);

  const PRECISE_LOCATION_TEMPLATES =
    new Set([
      "printer-ink",
      "printer-connectivity",
      "equipment-out-of-service"
    ]);

  const BROAD_LOCATION =
    /^(?:the\s+)?(?:packaging|packing|receiving|shipping|warehouse|production|operations|quality|office|front office|back office|returns|phoenix|chicago|wisconsin|toronto)(?:\s+area)?$/i;

  const clean = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  const has = (value) =>
    Array.isArray(value)
      ? value.length > 0
      : clean(value) !== "";

  const copy = (value) =>
    value == null
      ? value
      : JSON.parse(
          JSON.stringify(value)
        );

  const unsure = (value) =>
    /\bnot sure\b|\bunsure\b|\bdon't know\b|\bdo not know\b/i.test(
      clean(value)
    );

  function diagnostics(template) {
    return template.diagnostics || {
      requiredForWork: [],
      suggestedFirstAction: "",
      questions: []
    };
  }

  function questionById(
    template,
    id
  ) {
    return (
      diagnostics(template).questions || []
    ).find(
      (question) =>
        question.id === id
    ) || null;
  }

  function isLocationField(field) {
    if (!field) {
      return false;
    }

    return /location|station|workstation|area/i.test(
      `${field.id || ""} ` +
      `${field.label || ""} ` +
      `${field.extractor || ""}`
    );
  }

  function locationNeedsDetail(
    template,
    field,
    value
  ) {
    if (
      !template ||
      !field ||
      !has(value) ||
      !PRECISE_LOCATION_TEMPLATES.has(
        template.id
      ) ||
      !isLocationField(field)
    ) {
      return false;
    }

    const answer = clean(value)
      .replace(/[.,]+$/, "");

    /*
     * "Not sure" is accepted as an explicit answer.
     * The receiver brief will show the information gap.
     */
    if (unsure(answer)) {
      return false;
    }

    return (
      BROAD_LOCATION.test(answer) ||
      /\b(?:cannot|can't|won't|not working|issue|problem)\b/i.test(
        answer
      )
    );
  }

  function requiredRoutingFields(
    template
  ) {
    return (
      template.fields || []
    ).filter(
      (field) =>
        field.required &&
        !PROFILE_FIELDS.has(field.id) &&
        !SKIP_FIELDS.has(field.id)
    );
  }

  /*
   * Recalculate routing readiness and reject
   * broad locations such as "Packaging".
   */
  function normalizeRouting(result) {
    const fields = {
      ...(result.extractedFields || {})
    };

    const details = copy(
      result.extractionDetails || {}
    );

    (result.template.fields || [])
      .forEach((field) => {
        if (
          !locationNeedsDetail(
            result.template,
            field,
            fields[field.id]
          )
        ) {
          return;
        }

        fields[field.id] = "";

        if (details[field.id]) {
          details[field.id].value = "";
          details[field.id].source = "";
        }
      });

    const required =
      requiredRoutingFields(
        result.template
      );

    const missing =
      required.filter(
        (field) =>
          !has(fields[field.id])
      );

    const total = required.length;
    const answered =
      total - missing.length;

    const score = total
      ? Math.round(
          (answered / total) * 100
        )
      : 100;

    return {
      fields,
      details,
      missing,

      readiness: {
        score,

        status:
          result.template.id ===
          "general-triage"
            ? "human-triage"
            : score === 100
              ? "ready"
              : "needs-information",

        answered,
        total,

        missing:
          missing.map(
            (field) => field.label
          )
      }
    };
  }

  /*
   * Find diagnostic values already included
   * in the employee's original description.
   */
  function matchSignal(
    text,
    question
  ) {
    const input =
      clean(text).toLowerCase();

    let best = null;

    Object.entries(
      question.signals || {}
    ).forEach(
      ([answer, signals]) => {
        (signals || []).forEach(
          (signal) => {
            const phrase =
              clean(signal)
                .toLowerCase();

            if (
              phrase &&
              input.includes(phrase) &&
              (
                !best ||
                phrase.length >
                  best.phrase.length
              )
            ) {
              best = {
                answer,
                phrase
              };
            }
          }
        );
      }
    );

    return best
      ? best.answer
      : "";
  }

  function inferTextAnswer(
    text,
    question
  ) {
    const input = clean(text);

    if (
      question.id ===
      "requestedOutcome"
    ) {
      return input;
    }

    if (
      question.id !==
      "expectedOutcome"
    ) {
      return "";
    }

    const match = input.match(
      /(?:should|supposed to|expected to|needs? to)\s+([^.!?]+)/i
    );

    return match
      ? clean(match[1])
      : "";
  }

  function normalizeDiagnosticAnswer(
    template,
    id,
    value
  ) {
    const question =
      questionById(
        template,
        id
      );

    const answer = clean(value);

    if (!question) {
      return answer;
    }

    const exact =
      (question.options || [])
        .find(
          (option) =>
            clean(option)
              .toLowerCase() ===
            answer.toLowerCase()
        );

    return (
      exact ||
      matchSignal(
        answer,
        question
      ) ||
      answer
    );
  }

  /*
   * Build diagnostic answers and work readiness.
   */
  function collectDiagnostics(
    result,
    saved = {}
  ) {
    const profile =
      diagnostics(result.template);

    const answers = {};
    const details = {};

    (profile.questions || [])
      .forEach((question) => {
        let value = "";
        let source = "";

        if (
          has(saved[question.id])
        ) {
          value =
            normalizeDiagnosticAnswer(
              result.template,
              question.id,
              saved[question.id]
            );

          source = "clarification";
        } else {
          value =
            matchSignal(
              result.originalText,
              question
            );

          if (value) {
            source = "description";
          } else if (
            question.type ===
            "textarea"
          ) {
            value =
              inferTextAnswer(
                result.originalText,
                question
              );

            if (value) {
              source = "description";
            }
          }
        }

        answers[question.id] =
          value;

        details[question.id] = {
          id: question.id,
          label: question.label,

          reportLabel:
            question.reportLabel ||
            question.label,

          value,
          source,

          requiredForWork:
            (
              profile.requiredForWork ||
              []
            ).includes(
              question.id
            ),

          requesterUnsure:
            unsure(value)
        };
      });

    const required =
      profile.requiredForWork || [];

    const missingIds =
      required.filter(
        (id) =>
          !has(answers[id])
      );

    const answeredIds =
      required.filter(
        (id) =>
          has(answers[id])
      );

    const unsureIds =
      answeredIds.filter(
        (id) =>
          unsure(answers[id])
      );

    const questionMap =
      new Map(
        (
          profile.questions || []
        ).map(
          (question) => [
            question.id,
            question
          ]
        )
      );

    const total = required.length;
    const answered =
      answeredIds.length;

    const score = total
      ? Math.round(
          (answered / total) * 100
        )
      : 100;

    return {
      answers,
      details,

      missing:
        missingIds
          .map(
            (id) =>
              questionMap.get(id)
          )
          .filter(Boolean),

      readiness: {
        score,

        status:
          score < 100
            ? "needs-information"
            : unsureIds.length
              ? "requester-unsure"
              : "ready",

        answered,
        total,

        missing:
          missingIds.map(
            (id) =>
              questionMap.get(id)
                ?.label || id
          ),

        unsure:
          unsureIds.map(
            (id) =>
              questionMap.get(id)
                ?.label || id
          )
      }
    };
  }

  function exactLocationQuestion(
    template
  ) {
    if (
      template.id === "printer-ink" ||
      template.id ===
        "printer-connectivity"
    ) {
      return "Which exact station, line, or printer is affected? For example: Pack Station 14, Packaging Line 2, or PHX-PRN-22.";
    }

    if (
      template.id ===
      "equipment-out-of-service"
    ) {
      return "Where exactly is the equipment located? For example: Receiving Door 5, Aisle 12, or Battery Station 2.";
    }

    return "Which exact area, room, station, line, door, or asset is affected?";
  }

  function routingQuestionText(
    field,
    template
  ) {
    const id =
      String(field.id || "")
        .toLowerCase();

    const extractor =
      String(
        field.extractor || ""
      ).toLowerCase();

    const label =
      clean(field.label)
        .replace(/\?$/, "")
        .toLowerCase();

    if (isLocationField(field)) {
      return exactLocationQuestion(
        template
      );
    }

    if (id === "lastuser") {
      return "Who was using the equipment when the issue occurred?";
    }

    if (
      id === "mhenumber" ||
      extractor === "assetnumber"
    ) {
      return "What is the equipment or MHE number shown on the unit?";
    }

    if (id === "partnumber") {
      return "What part number should the warehouse verify?";
    }

    if (
      id === "stockchecktype"
    ) {
      return "What should the warehouse verify: quantity, date codes, condition, packaging, or everything?";
    }

    if (
      id === "pendingorder"
    ) {
      return "Is there a pending customer order connected to this request?";
    }

    if (id === "system") {
      return "Which system is affected: MERP, OMS, SYQ, API, EDI, the website, or another system?";
    }

    if (
      id === "requestkind"
    ) {
      return "Is this an issue, enhancement, access request, or data correction?";
    }

    if (
      id === "impact" ||
      id === "urgency"
    ) {
      return "How is this affecting work right now?";
    }

    if (id === "issuetype") {
      return "Which best describes what is happening?";
    }

    if (
      field.type === "select"
    ) {
      return `Which option best describes ${label}?`;
    }

    if (
      field.type === "textarea" ||
      id === "description"
    ) {
      return "Can you briefly describe what is happening and what you expected to happen?";
    }

    return `What should I include for ${label}?`;
  }

  function routingQuestion(
    field,
    template,
    index
  ) {
    return {
      id:
        `clarification-routing-${index + 1}`,

      kind: "routing",

      fieldId: field.id,
      diagnosticId: null,

      label: field.label,
      fieldType: field.type,

      options: copy(
        field.options || []
      ),

      question:
        routingQuestionText(
          field,
          template
        ),

      why:
        isLocationField(field)
          ? "This helps the receiving team find the exact equipment or work area without returning the request."
          : "This information is required to route the request correctly.",

      required: true,
      requiredFor: "routing"
    };
  }

  function diagnosticQuestionObject(
    question,
    index
  ) {
    return {
      id:
        `clarification-diagnostic-${index + 1}`,

      kind: "diagnostic",

      fieldId:
        `diagnostic:${question.id}`,

      diagnosticId:
        question.id,

      label:
        question.label,

      fieldType:
        question.type || "text",

      options: copy(
        question.options || []
      ),

      question:
        question.question,

      why:
        question.why ||
        "This helps the receiving team begin work without returning the request.",

      required: true,
      requiredFor: "work"
    };
  }

  /*
   * Select one question at a time.
   *
   * Printer symptom and safety questions can
   * take priority over ordinary routing fields.
   */
  function chooseQuestion(
    result,
    routing,
    diagnostic
  ) {
    const routingQuestions =
      routing.missing.map(
        (field, index) =>
          routingQuestion(
            field,
            result.template,
            index
          )
      );

    const diagnosticQuestions =
      diagnostic.missing.map(
        (question, index) =>
          diagnosticQuestionObject(
            question,
            index
          )
      );

    const ambiguousPrinter =
      result.template.id ===
        "printer-connectivity" &&
      /\b(?:printer|print|toner|ink|ribbon)\b/i.test(
        result.originalText
      );

    if (ambiguousPrinter) {
      const symptom =
        diagnosticQuestions.find(
          (question) =>
            question.diagnosticId ===
            "symptom"
        );

      if (symptom) {
        return [symptom];
      }
    }

    const safetyFirst =
      diagnosticQuestions.find(
        (question) =>
          [
            "safetyStatus",
            "safetyConcern",
            "containmentStatus"
          ].includes(
            question.diagnosticId
          )
      );

    if (safetyFirst) {
      return [safetyFirst];
    }

    return [
      ...routingQuestions,
      ...diagnosticQuestions
    ].slice(0, 1);
  }

  function briefValue(
    source,
    ids
  ) {
    for (const id of ids) {
      if (
        has(source[id]?.value)
      ) {
        return source[id].value;
      }
    }

    return "";
  }

  /*
   * Generate a receiver-ready work brief.
   */
  function buildReceiverBrief(
    result,
    routing,
    diagnostic
  ) {
    const fields =
      routing.details;

    const detail =
      diagnostic.details;

    const location =
      briefValue(
        fields,
        [
          "workstation",
          "printerLocation",
          "mheLocation",
          "location"
        ]
      );

    const identifier =
      briefValue(
        fields,
        [
          "printerName",
          "mheNumber",
          "partNumber",
          "system"
        ]
      );

    const symptom =
      briefValue(
        detail,
        [
          "symptom",
          "failureMode",
          "problemCategory",
          "resultNeeded",
          "supplyStatus"
        ]
      );

    const scope =
      briefValue(
        detail,
        [
          "affectedScope",
          "printingImpact"
        ]
      );

    const containment =
      briefValue(
        detail,
        [
          "safetyStatus",
          "containmentStatus",
          "safetyConcern"
        ]
      );

    const requestedOutcome =
      briefValue(
        detail,
        [
          "requestedOutcome",
          "expectedOutcome"
        ]
      );

    let title =
      `${result.template.name}: ` +
      clean(result.initialText)
        .slice(0, 70);

    if (
      result.template.id ===
      "printer-connectivity"
    ) {
      title =
        `${symptom || "Printer issue"}` +
        `${
          location
            ? ` at ${location}`
            : ""
        }`;
    }

    if (
      result.template.id ===
      "printer-ink"
    ) {
      title =
        "Printer supply request" +
        `${
          location
            ? ` at ${location}`
            : ""
        }`;
    }

    if (
      result.template.id ===
      "equipment-out-of-service"
    ) {
      title =
        `${identifier || "Equipment"}: ` +
        `${symptom || "Out of service"}` +
        `${
          location
            ? ` at ${location}`
            : ""
        }`;
    }

    if (
      result.template.id ===
      "stock-check-phoenix"
    ) {
      title =
        `Stock check ${identifier || "request"}` +
        `${
          symptom
            ? ` - ${symptom}`
            : ""
        }`;
    }

    if (
      result.template.id ===
      "systems-intake"
    ) {
      title =
        `${identifier || "System"} request: ` +
        clean(
          result.initialText
        ).slice(0, 60);
    }

    if (
      result.template.id ===
      "facilities-hvac"
    ) {
      title =
        "HVAC issue" +
        `${
          location
            ? ` at ${location}`
            : ""
        }`;
    }

    const facts =
      Object.values(detail)
        .filter(
          (item) =>
            has(item.value)
        )
        .map(
          (item) =>
            `${item.reportLabel}: ${item.value}`
        );

    const unsureItems =
      Object.values(detail)
        .filter(
          (item) =>
            item.requesterUnsure
        )
        .map(
          (item) =>
            `${item.label} (requester was unsure)`
        );

    const keyIdentifiers =
      Object.values(fields)
        .filter(
          (item) =>
            has(item.value) &&
            !/description|summary|impact|urgency|requested for|attachment/i.test(
              `${item.fieldId} ${item.label}`
            )
        )
        .slice(0, 7)
        .map(
          (item) => ({
            label: item.label,
            value: item.value
          })
        );

    return {
      title,

      requestedOutcome:
        requestedOutcome ||
        `Resolve the ${result.template.name.toLowerCase()} request.`,

      observedSituation:
        facts.length
          ? `${result.initialText} ${facts.join(". ")}.`
          : result.initialText,

      expectedSituation:
        briefValue(
          detail,
          ["expectedOutcome"]
        ) ||
        "The requested process or equipment should operate as expected.",

      affectedScope:
        scope ||
        "The affected scope was not confirmed.",

      keyIdentifiers,

      businessImpact:
        result.businessImpact,

      actionsAlreadyTaken:
        "No troubleshooting or corrective action was reported unless noted in the request.",

      safetyOrContainment:
        containment ||
        "No safety or containment concern was reported or required.",

      informationGaps: [
        ...routing.missing.map(
          (field) => field.label
        ),

        ...diagnostic.missing.map(
          (question) =>
            question.label
        ),

        ...unsureItems
      ],

      suggestedFirstAction:
        diagnostics(
          result.template
        ).suggestedFirstAction ||
        "Review the request and confirm the next appropriate action.",

      routingExplanation:
        `Routed to ${result.template.queue} using the ${result.template.name} request template.`
    };
  }

  /*
   * Add all skyscraper information to the
   * existing baseline result.
   */
  function enhance(
    baseResult,
    savedAnswers = {},
    clarificationCount = 0
  ) {
    if (
      !baseResult?.ok ||
      baseResult.requiresP1
    ) {
      if (
        !baseResult?.requiresP1
      ) {
        return baseResult;
      }

      return {
        ...baseResult,

        routingReadiness: {
          score: 100,
          status: "p1-bypass",
          answered: 0,
          total: 0,
          missing: []
        },

        workReadiness: {
          score: 100,
          status: "p1-bypass",
          answered: 0,
          total: 0,
          missing: [],
          unsure: []
        },

        diagnosticAnswers: {},
        diagnosticDetails: {},
        missingDiagnostics: [],
        evidence: [],

        clarificationCount,

        receiverBrief: {
          title:
            "Shipping or manifesting stopped",

          requestedOutcome:
            "Restore outbound shipping or manifesting immediately.",

          observedSituation:
            baseResult.originalText,

          expectedSituation:
            "Outbound shipping should be able to continue.",

          affectedScope:
            "Outbound shipping may be affected.",

          keyIdentifiers: [],

          businessImpact:
            baseResult.businessImpact,

          actionsAlreadyTaken:
            "Immediate P1 escalation was initiated.",

          safetyOrContainment:
            "Immediate P1 escalation is the containment action.",

          informationGaps: [],

          suggestedFirstAction:
            "Engage the Warehouse Systems on-call response immediately.",

          routingExplanation:
            "P1 bypass routed directly to Warehouse Systems / On-call."
        }
      };
    }

    const routing =
      normalizeRouting(baseResult);

    const diagnostic =
      collectDiagnostics(
        baseResult,
        savedAnswers
      );

    const questions =
      chooseQuestion(
        baseResult,
        routing,
        diagnostic
      );

    const result = {
      ...baseResult,

      answerAccepted: true,

      extractedFields:
        routing.fields,

      extractionDetails:
        routing.details,

      missingFields:
        routing.missing.map(
          (field) => ({
            id: field.id,
            label: field.label,
            type: field.type,

            options: copy(
              field.options || []
            )
          })
        ),

      routingReadiness:
        routing.readiness,

      diagnosticAnswers:
        diagnostic.answers,

      diagnosticDetails:
        diagnostic.details,

      missingDiagnostics:
        diagnostic.missing.map(
          (question) => ({
            id: question.id,
            label: question.label,

            type:
              question.type ||
              "text",

            options: copy(
              question.options || []
            )
          })
        ),

      workReadiness:
        diagnostic.readiness,

      clarificationQuestions:
        questions,

      clarificationCount,

      requestPlan: {
        ...(
          baseResult.requestPlan ||
          {}
        ),

        routingStatus:
          routing.readiness.status,

        workStatus:
          diagnostic.readiness.status,

        routingReadinessScore:
          routing.readiness.score,

        workReadinessScore:
          diagnostic.readiness.score
      }
    };

    result.receiverBrief =
      buildReceiverBrief(
        result,
        routing,
        diagnostic
      );

    result.evidence = [
      ...Object.values(
        routing.details
      ).filter(
        (item) =>
          has(item.value)
      ),

      ...Object.values(
        diagnostic.details
      ).filter(
        (item) =>
          has(item.value)
      )
    ];

    const next =
      questions[0] || null;

    result.assistantResponse = {
      status:
        next
          ? "clarification"
          : result.template.id ===
              "general-triage"
            ? "human-triage"
            : "ready-for-review",

      acknowledgement:
        `I can help with this ${result.template.name.toLowerCase()} request.`,

      interpretation:
        `This appears to be a ${result.template.name} request routed to ${result.requestPlan.queue}.`,

      explanation:
        routing.readiness.score < 100
          ? "I am gathering the information required to route it correctly."
          : diagnostic.readiness.score < 100
            ? "Routing is ready. I am gathering one more detail so the receiving team can begin work without sending the ticket back."
            : "Routing and work-readiness information are complete.",

      nextQuestion:
        next?.question || "",

      questionReason:
        next?.why || "",

      progressMessage:
        `Routing readiness: ${routing.readiness.score}%. ` +
        `Work readiness: ${diagnostic.readiness.score}%.`,

      readyMessage:
        next
          ? ""
          : "The request is ready for review."
    };

    result.reportingData = {
      templateId:
        result.template.id,

      templateName:
        result.template.name,

      queue:
        result.requestPlan.queue,

      priority:
        result.requestPlan.priority,

      confidence:
        result.confidence,

      routingReadinessScore:
        routing.readiness.score,

      routingReadinessStatus:
        routing.readiness.status,

      workReadinessScore:
        diagnostic.readiness.score,

      workReadinessStatus:
        diagnostic.readiness.status,

      clarificationCount,

      diagnosticCategories:
        copy(
          diagnostic.answers
        ),

      requesterUnsureCount:
        diagnostic.readiness
          .unsure.length,

      p1Bypass: false
    };

    result.response = next
      ? `${result.assistantResponse.acknowledgement} ${result.assistantResponse.explanation} ${next.question}`
      : `${result.assistantResponse.acknowledgement} ${result.assistantResponse.readyMessage}`;

    return result;
  }

  function locationRetry(
    previousResult,
    field,
    answer
  ) {
    const area = clean(answer);

    const question =
      `I found "${area}" as the general area. ` +
      "Which exact station, line, door, or printer is affected? " +
      "For example: Pack Station 14, Packaging Line 2, " +
      "Receiving Door 5, or PHX-PRN-22.";

    return {
      ...previousResult,

      answerAccepted: false,

      validationMessage:
        `"${area}" identifies the general department, ` +
        "but not the exact station, line, door, or printer.",

      clarificationQuestions: [
        {
          id:
            "clarification-location-specific",

          kind: "routing",

          fieldId: field.id,
          diagnosticId: null,

          label: field.label,

          fieldType:
            field.type || "text",

          options: [],

          question,

          why:
            "The receiving team needs a precise location so they can find the correct printer or equipment without returning the request.",

          required: true,
          requiredFor: "routing"
        }
      ],

      response: question
    };
  }

  function analyze(text) {
    return enhance(
      Base.analyze(text),
      {},
      0
    );
  }

  function continueAnalysis(
    previousResult,
    fieldId,
    answer
  ) {
    if (
      !previousResult?.originalText
    ) {
      throw new Error(
        "A previous Request Engine result is required."
      );
    }

    if (
      previousResult.requiresP1 ||
      !has(answer)
    ) {
      return previousResult;
    }

    const template =
      previousResult.template;

    const cleaned =
      clean(answer);

    const isDiagnostic =
      String(fieldId)
        .startsWith(
          "diagnostic:"
        );

    /*
     * Normal routing answer.
     */
    if (!isDiagnostic) {
      const field =
        (
          template.fields || []
        ).find(
          (item) =>
            item.id === fieldId
        );

      if (
        field &&
        locationNeedsDetail(
          template,
          field,
          cleaned
        )
      ) {
        return locationRetry(
          previousResult,
          field,
          cleaned
        );
      }

      return enhance(
        Base.continueAnalysis(
          previousResult,
          fieldId,
          cleaned
        ),

        previousResult
          .diagnosticAnswers ||
          {},

        Number(
          previousResult
            .clarificationCount || 0
        ) + 1
      );
    }

    /*
     * Diagnostic answer.
     */
    const diagnosticId =
      String(fieldId).slice(
        "diagnostic:".length
      );

    const normalized =
      normalizeDiagnosticAnswer(
        template,
        diagnosticId,
        cleaned
      );

    const updatedAnswers = {
      ...(
        previousResult
          .diagnosticAnswers || {}
      ),

      [diagnosticId]:
        normalized
    };

    /*
     * A vague printer issue can change to
     * Printer Ink after the employee identifies
     * an ink, toner, ribbon, or cartridge problem.
     */
    if (
      template.id ===
        "printer-connectivity" &&
      diagnosticId ===
        "symptom" &&
      /ink|toner|ribbon/i.test(
        normalized
      )
    ) {
      const supplyText =
        `${previousResult.originalText}. ` +
        "Printer toner cartridge request. " +
        `Supply status: ${normalized}.`;

      const supplyBase =
        Base.analyze(
          supplyText
        );

      supplyBase.initialText =
        previousResult.initialText ||
        previousResult.originalText;

      return enhance(
        supplyBase,

        {
          supplyStatus:
            /completely out/i.test(
              normalized
            )
              ? "Completely out"
              : "Getting low"
        },

        Number(
          previousResult
            .clarificationCount || 0
        ) + 1
      );
    }

    /*
     * Let the baseline engine re-extract normal
     * fields while keeping the selected template.
     */
    const marker =
      `__diagnostic_${diagnosticId}`;

    const baseResult =
      Base.continueAnalysis(
        previousResult,
        marker,
        normalized
      );

    if (baseResult.fieldAnswers) {
      delete baseResult
        .fieldAnswers[marker];
    }

    baseResult.initialText =
      previousResult.initialText ||
      previousResult.originalText;

    return enhance(
      baseResult,
      updatedAnswers,

      Number(
        previousResult
          .clarificationCount || 0
      ) + 1
    );
  }

  window.MasterFlowRequestEngine = {
    analyze,
    continueAnalysis,

    isShippingStopped:
      Base.isShippingStopped,

    /*
     * Keep access to the stable baseline
     * for debugging during the prototype.
     */
    baseEngine: Base
  };
})();