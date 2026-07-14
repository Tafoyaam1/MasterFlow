(function () {
    "use strict";
  
    const Templates =
      window.MasterFlowTemplates;
  
    const Store =
      window.MasterFlowStore;
  
    if (!Templates) {
      throw new Error(
        "MasterFlowTemplates must load before request-engine.js"
      );
    }
  
    if (!Store) {
      throw new Error(
        "MasterFlowStore must load before request-engine.js"
      );
    }
  
    const MAX_CLARIFICATION_QUESTIONS = 2;
  
    /*
     * These fields can come from the employee profile.
     * MasterFlow should not ask the employee for them again.
     */
    const PROFILE_FIELDS = new Set([
      "requestedFor"
    ]);
  
    /*
     * Attachments should not interrupt the conversational flow.
     */
    const NON_CONVERSATIONAL_FIELDS =
      new Set([
        "attachments"
      ]);
  
    function clone(value) {
      if (
        value === undefined ||
        value === null
      ) {
        return value;
      }
  
      return JSON.parse(
        JSON.stringify(value)
      );
    }
  
    function cleanText(value) {
      return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
    }
  
    function hasValue(value) {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
  
      return cleanText(value) !== "";
    }
  
    /*
     * Shipping-stopped requests always bypass
     * normal AI classification.
     */
    function isShippingStopped(text) {
      const input =
        cleanText(text).toLowerCase();
  
      const shippingSignal =
        /\bshipping\b|\bshipment\b|\bmanifest(?:ing)?\b|\boutbound\b/.test(
          input
        );
  
      const stoppedSignal =
        /\bstopped\b|\bdown\b|\bblocked\b|\bcannot\b|\bcan't\b|\bunable\b|\bnot working\b/.test(
          input
        );
  
      return (
        shippingSignal &&
        stoppedSignal
      );
    }
  
    /*
     * Extract values from the employee message,
     * employee profile, and clarification answers.
     */
    function extractFields(
      text,
      template,
      fieldAnswers = {}
    ) {
      const extractedFields = {};
      const extractionDetails = {};
  
      (template.fields || []).forEach(
        (field) => {
          const hasClarificationAnswer =
            Object.prototype.hasOwnProperty.call(
              fieldAnswers,
              field.id
            ) &&
            hasValue(
              fieldAnswers[field.id]
            );
  
          const result =
            hasClarificationAnswer
              ? {
                  value: cleanText(
                    fieldAnswers[field.id]
                  ),
                  source: "clarification"
                }
              : Templates.extract(
                  text,
                  field
                ) || {
                  value: "",
                  source: ""
                };
  
          extractedFields[field.id] =
            result.value || "";
  
          extractionDetails[field.id] = {
            fieldId: field.id,
            label: field.label,
            value: result.value || "",
            source: result.source || "",
            required: Boolean(
              field.required
            ),
            recommended: Boolean(
              field.recommended
            )
          };
        }
      );
  
      return {
        extractedFields,
        extractionDetails
      };
    }
  
    /*
     * Determine which required fields still
     * need an employee answer.
     */
    function findMissingFields(
      template,
      extractedFields
    ) {
      return (
        template.fields || []
      ).filter((field) => {
        if (!field.required) {
          return false;
        }
  
        if (
          PROFILE_FIELDS.has(field.id)
        ) {
          return false;
        }
  
        if (
          NON_CONVERSATIONAL_FIELDS.has(
            field.id
          )
        ) {
          return false;
        }
  
        return !hasValue(
          extractedFields[field.id]
        );
      });
    }
  
    function locationQuestion(
      field,
      template
    ) {
      if (
        template.id === "printer-ink"
      ) {
        return "What station or area is the printer located at?";
      }
  
      if (
        template.id ===
        "printer-connectivity"
      ) {
        return "What station or work area is experiencing the issue?";
      }
  
      if (
        template.id ===
        "equipment-out-of-service"
      ) {
        return "Where is the equipment currently located?";
      }
  
      if (
        template.id ===
        "facilities-hvac"
      ) {
        return "Which area or station is experiencing the temperature issue?";
      }
  
      return (
        "What location should I include for " +
        `${field.label.toLowerCase()}?`
      );
    }
  
    function selectQuestion(field) {
      const options = (
        field.options || []
      )
        .filter(Boolean)
        .filter(
          (option) =>
            !/shipping is stopped/i.test(
              option
            )
        );
  
      if (!options.length) {
        return (
          "What should I enter for " +
          `${field.label.toLowerCase()}?`
        );
      }
  
      if (options.length <= 5) {
        return (
          `${field.label}: ` +
          `${options.join(", ")}?`
        );
      }
  
      return (
        "Which option best describes " +
        `${field.label.toLowerCase()}?`
      );
    }
  
    /*
     * Generate a contextual clarification question.
     */
    function questionForField(
      field,
      template
    ) {
      const fieldId = String(
        field.id || ""
      ).toLowerCase();
  
      const extractor = String(
        field.extractor || ""
      ).toLowerCase();
  
      if (
        fieldId.includes("location") ||
        fieldId.includes("station") ||
        fieldId.includes("workstation") ||
        extractor === "location"
      ) {
        return locationQuestion(
          field,
          template
        );
      }
  
      if (
        fieldId === "mhenumber" ||
        extractor === "assetnumber"
      ) {
        return "What is the equipment or MHE number shown on the unit?";
      }
  
      if (fieldId === "lastuser") {
        return "Who was using the equipment when the issue occurred?";
      }
  
      if (fieldId === "partnumber") {
        return "What part number should the warehouse verify?";
      }
  
      if (
        fieldId === "stockchecktype"
      ) {
        return "What would you like the warehouse to verify: quantity, date code, condition, packaging, or everything?";
      }
  
      if (
        fieldId === "pendingorder"
      ) {
        return "Is there currently a pending customer order connected to this request?";
      }
  
      if (fieldId === "system") {
        return "Which system is affected: MERP, OMS, SYQ, API, EDI, the website, or another system?";
      }
  
      if (
        fieldId === "requestkind"
      ) {
        return "Is this something that is broken, a new enhancement, an access request, or a data correction?";
      }
  
      if (
        fieldId === "impact" ||
        fieldId === "urgency"
      ) {
        return "How is this affecting your work right now?";
      }
  
      if (field.type === "select") {
        return selectQuestion(field);
      }
  
      if (
        field.type === "textarea" ||
        fieldId === "description"
      ) {
        return "Can you briefly describe what is happening and what you expected to happen?";
      }
  
      return (
        "What should I include for " +
        `${field.label.toLowerCase()}?`
      );
    }
  
    /*
     * Ask no more than two questions at once.
     *
     * Fields using the same extractor are treated
     * as the same question.
     */
    function buildClarificationQuestions(
      missingFields,
      template
    ) {
      const seen = new Set();
  
      return missingFields
        .filter((field) => {
          const key = field.extractor
            ? `extractor:${field.extractor}`
            : `field:${field.id}`;
  
          if (seen.has(key)) {
            return false;
          }
  
          seen.add(key);
          return true;
        })
        .slice(
          0,
          MAX_CLARIFICATION_QUESTIONS
        )
        .map((field, index) => ({
          id:
            `clarification-${index + 1}`,
  
          fieldId: field.id,
          label: field.label,
          fieldType: field.type,
  
          options: clone(
            field.options || []
          ),
  
          question: questionForField(
            field,
            template
          ),
  
          required: true
        }));
    }
  
    function recommendPriority(
      template,
      text
    ) {
      const input =
        cleanText(text).toLowerCase();
  
      const workStopped =
        /\bwork stopped\b|\bcannot work\b|\bcan't work\b|\bunable to work\b|\bcompletely down\b|\bwill not move\b|\bwon't move\b/.test(
          input
        );
  
      const degraded =
        /\bslow\b|\bslowed\b|\bintermittent\b|\bjamming\b|\bdelay\b|\bworkaround\b/.test(
          input
        );
  
      if (
        template.id ===
          "equipment-out-of-service" &&
        workStopped
      ) {
        return {
          value: "P2 - High",
          reason:
            "Equipment is unusable and may create an operational or safety impact."
        };
      }
  
      if (workStopped) {
        return {
          value: "P2 - High",
          reason:
            "The description indicates that work is stopped."
        };
      }
  
      if (degraded) {
        return {
          value: "P3 - Normal",
          reason:
            "Work appears to be continuing with reduced efficiency."
        };
      }
  
      return {
        value:
          template.priority ||
          "P3 - Normal",
  
        reason:
          "The template's standard priority applies."
      };
    }
  
    function describeBusinessImpact(
      text,
      template
    ) {
      const input =
        cleanText(text).toLowerCase();
  
      if (
        /\bmultiple\b|\beveryone\b|\ball stations\b|\bwhole area\b|\bdepartment\b/.test(
          input
        )
      ) {
        return "Multiple employees or stations may be affected.";
      }
  
      if (
        /\bcannot\b|\bcan't\b|\bwon't\b|\bunable\b|\bnot working\b|\bstopped\b/.test(
          input
        )
      ) {
        return "At least one employee, station, or process may be unable to continue working.";
      }
  
      if (
        /\bslow\b|\bjamming\b|\bintermittent\b|\bdelay\b/.test(
          input
        )
      ) {
        return "Work can continue, but productivity may be reduced.";
      }
  
      if (
        template.id === "printer-ink"
      ) {
        return "The printer may become unavailable if supplies are not replaced.";
      }
  
      return "Business impact will be confirmed during review.";
    }
  
    function buildKnowledgeRecommendations(
      template
    ) {
      if (!template.article) {
        return [];
      }
  
      return [
        {
          title:
            template.article.title,
  
          summary:
            template.article.summary,
  
          source: "template"
        }
      ];
    }
  
    /*
     * Placeholder for future duplicate-ticket
     * detection.
     */
    function findPossibleDuplicates() {
      return [];
    }
  
    function buildRequestPlan(
      template,
      priority,
      confidence
    ) {
      return {
        templateId: template.id,
        templateName: template.name,
        catalog: template.catalog,
        queue: template.queue,
  
        priority:
          priority.value,
  
        responseSlaHours:
          template.responseSlaHours,
  
        resolutionSlaHours:
          template.resolutionSlaHours,
  
        approvalRequired: Boolean(
          template.approvalRequired
        ),
  
        routingStatus:
          template.id ===
          "general-triage"
            ? "human-triage"
            : "ready",
  
        classificationConfidence:
          confidence
      };
    }
  
    function responseMessage(result) {
      if (result.requiresP1) {
        return "Shipping appears to be stopped. I’m opening the immediate P1 workflow instead of creating a normal request.";
      }
  
      if (
        result.clarificationQuestions
          .length
      ) {
        const firstQuestion =
          result
            .clarificationQuestions[0]
            .question;
  
        return (
          "I found the best request type. " +
          "Before I prepare it for review, " +
          `I need one detail: ${firstQuestion}`
        );
      }
  
      if (
        result.template.id ===
        "general-triage"
      ) {
        return "I prepared a general request and will route it to Business Enablement so a person can confirm the correct team.";
      }
  
      return (
        "I found the best request type and " +
        "gathered everything required. " +
        `Your ${result.template.name} request is ready for review.`
      );
    }
  
    /*
     * Main Request Engine entry point.
     */
    function analyze(text) {
      const originalText =
        cleanText(text);
  
      if (!originalText) {
        return {
          ok: false,
          error:
            "Please describe what you need help with."
        };
      }
  
      /*
       * P1 shipping-stopped workflow.
       */
      if (
        isShippingStopped(originalText)
      ) {
        const result = {
          ok: true,
  
          originalText,
          initialText: originalText,
  
          fieldAnswers: {},
  
          requiresP1: true,
          template: null,
          confidence: 100,
  
          extractedFields: {},
          extractionDetails: {},
  
          missingFields: [],
          clarificationQuestions: [],
  
          priority: {
            value: "P1 - Critical",
  
            reason:
              "Shipping-stopped incidents use the immediate emergency workflow."
          },
  
          businessImpact:
            "Outbound shipping or manifesting may be stopped.",
  
          duplicateTickets: [],
          knowledgeArticles: [],
  
          requestPlan: {
            routingStatus:
              "p1-fast-lane",
  
            queue:
              "Warehouse Systems / On-call",
  
            priority:
              "P1 - Critical"
          }
        };
  
        result.response =
          responseMessage(result);
  
        return result;
      }
  
      const classification =
        Templates.classify(
          originalText
        );
  
      const template =
        classification.template;
  
      const extraction =
        extractFields(
          originalText,
          template
        );
  
      const missingFields =
        findMissingFields(
          template,
          extraction.extractedFields
        );
  
      const clarificationQuestions =
        buildClarificationQuestions(
          missingFields,
          template
        );
  
      const priority =
        recommendPriority(
          template,
          originalText
        );
  
      const result = {
        ok: true,
  
        originalText,
        initialText: originalText,
  
        fieldAnswers: {},
  
        requiresP1: false,
  
        template: clone(template),
  
        suggestedTemplate:
          classification.suggestedTemplate
            ? clone(
                classification
                  .suggestedTemplate
              )
            : clone(template),
  
        confidence:
          classification.confidence,
  
        confidenceThreshold:
          classification.threshold,
  
        classificationReason:
          classification.reason,
  
        rankedTemplates: clone(
          classification.ranked || []
        ),
  
        extractedFields:
          extraction.extractedFields,
  
        extractionDetails:
          extraction.extractionDetails,
  
        missingFields:
          missingFields.map(
            (field) => ({
              id: field.id,
              label: field.label,
              type: field.type,
  
              options: clone(
                field.options || []
              )
            })
          ),
  
        clarificationQuestions,
  
        priority,
  
        businessImpact:
          describeBusinessImpact(
            originalText,
            template
          ),
  
        duplicateTickets:
          findPossibleDuplicates(
            originalText,
            template
          ),
  
        knowledgeArticles:
          buildKnowledgeRecommendations(
            template
          ),
  
        requestPlan:
          buildRequestPlan(
            template,
            priority,
            classification.confidence
          )
      };
  
      result.response =
        responseMessage(result);
  
      return result;
    }
  
    /*
     * Add an employee clarification answer
     * and rebuild the request analysis.
     */
    function continueAnalysis(
      previousResult,
      fieldId,
      answer
    ) {
      if (
        !previousResult ||
        !previousResult.originalText
      ) {
        throw new Error(
          "A previous request-engine result is required."
        );
      }
  
      if (
        previousResult.requiresP1
      ) {
        return previousResult;
      }
  
      const cleanAnswer =
        cleanText(answer);
  
      if (!cleanAnswer) {
        return previousResult;
      }
  
      const template =
        previousResult.template;
  
      if (!template) {
        throw new Error(
          "The previous result does not contain a request template."
        );
      }
  
      const field = (
        template.fields || []
      ).find(
        (item) =>
          item.id === fieldId
      );
  
      const fieldLabel = field
        ? field.label
        : fieldId;
  
      const fieldAnswers = {
        ...(
          previousResult.fieldAnswers ||
          {}
        ),
  
        [fieldId]: cleanAnswer
      };
  
      /*
       * Reuse an answer for another required
       * field using the same extractor.
       */
      if (
        field &&
        field.extractor
      ) {
        (
          template.fields || []
        ).forEach((candidate) => {
          const sharesExtractor =
            candidate.id !== field.id &&
            candidate.required &&
            candidate.extractor ===
              field.extractor;
  
          if (
            sharesExtractor &&
            !hasValue(
              fieldAnswers[
                candidate.id
              ]
            )
          ) {
            fieldAnswers[
              candidate.id
            ] = cleanAnswer;
          }
        });
      }
  
      const expandedText =
        `${previousResult.originalText}. ` +
        `${fieldLabel}: ${cleanAnswer}.`;
  
      /*
       * A clarification answer might reveal
       * that shipping is stopped.
       */
      if (
        isShippingStopped(expandedText)
      ) {
        return analyze(expandedText);
      }
  
      /*
       * Preserve the original selected template
       * instead of reclassifying a short answer.
       */
      const extraction =
        extractFields(
          expandedText,
          template,
          fieldAnswers
        );
  
      const missingFields =
        findMissingFields(
          template,
          extraction.extractedFields
        );
  
      const clarificationQuestions =
        buildClarificationQuestions(
          missingFields,
          template
        );
  
      const priority =
        recommendPriority(
          template,
          expandedText
        );
  
      const result = {
        ...previousResult,
  
        ok: true,
  
        originalText:
          expandedText,
  
        initialText:
          previousResult.initialText ||
          previousResult.originalText,
  
        requiresP1: false,
  
        template:
          clone(template),
  
        fieldAnswers:
          clone(fieldAnswers),
  
        extractedFields:
          extraction.extractedFields,
  
        extractionDetails:
          extraction.extractionDetails,
  
        missingFields:
          missingFields.map(
            (item) => ({
              id: item.id,
              label: item.label,
              type: item.type,
  
              options: clone(
                item.options || []
              )
            })
          ),
  
        clarificationQuestions,
  
        priority,
  
        businessImpact:
          describeBusinessImpact(
            expandedText,
            template
          ),
  
        duplicateTickets:
          findPossibleDuplicates(
            expandedText,
            template
          ),
  
        knowledgeArticles:
          buildKnowledgeRecommendations(
            template
          ),
  
        requestPlan:
          buildRequestPlan(
            template,
            priority,
            previousResult.confidence
          )
      };
  
      result.response =
        responseMessage(result);
  
      return result;
    }
  
    window.MasterFlowRequestEngine = {
      analyze,
      continueAnalysis,
      isShippingStopped
    };
  })();