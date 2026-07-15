(function () {
  "use strict";

  if (document.body.dataset.page !== "admin-templates") return;

  const Templates = window.MasterFlowTemplates;
  const Engine = window.MasterFlowRequestEngine;
  const UI = window.MasterFlowUI;

  if (!Templates || !Engine || !UI || !UI.layoutReady) {
    console.error(
      "MasterFlow Flow Studio could not start because a dependency is missing."
    );
    return;
  }

  const ROLE_KEY = "masterflowAdminRoleV1";

  const ROLE_IDS = new Set([
    "platform-admin",
    "category-owner",
    "queue-manager"
  ]);

  // FLOW STUDIO M1: ROLE MODEL
  const ROLES = {
    "platform-admin": {
      label: "Megan Delia — Enterprise Administrator",
      badge: "Enterprise scope",
      badgeClass: "badge-purple",
      description:
        "View and edit every request flow, including governed routing, priority, SLA, approval, P1, and safety controls.",
      templateIds: ["*"],
      queues: ["*"],
      canEdit: true,
      canEditGoverned: true,
      canReset: true
    },

    "category-owner": {
      label: "IT Request Category Owner",
      badge: "Owned IT flows",
      badgeClass: "badge-teal",
      description:
        "Teach and test the IT flows you own. Request wording, recognition, questions, options, and work-readiness content are editable; governed controls stay locked.",
      templateIds: [
        "printer-ink",
        "printer-connectivity",
        "systems-intake"
      ],
      queues: [],
      canEdit: true,
      canEditGoverned: false,
      canReset: false
    },

    "queue-manager": {
      label: "IT Help Desk Queue Manager",
      badge: "Managed IT queues",
      badgeClass: "badge-blue",
      description:
        "Review and test flows entering IT Help Desk, IT Information, and Business Enablement - Systems Intake. Configuration is read-only.",
      templateIds: [],
      queues: [
        "IT Help Desk",
        "IT Information",
        "Business Enablement - Systems Intake"
      ],
      canEdit: false,
      canEditGoverned: false,
      canReset: false
    }
  };

  const CATEGORY_OWNER_LOCKS = [
    "#templateCatalog",
    "#templateQueue",
    "#templatePriority",
    "#responseSla",
    "#resolutionSla",
    '[data-field-prop="id"]',
    '[data-field-prop="extractor"]',
    '[data-field-prop="profileValue"]',
    '[data-field-prop="locked"]'
  ];

  let roleId = ROLE_IDS.has(
    window.localStorage.getItem(ROLE_KEY)
  )
    ? window.localStorage.getItem(ROLE_KEY)
    : "platform-admin";

  let activeTemplateId = "printer-ink";
  let renderQueued = false;

  function escapeHtml(value) {
    return UI.escapeHtml(
      String(value == null ? "" : value)
    );
  }

  function role() {
    return ROLES[roleId];
  }

  function templateInScope(template) {
    const current = role();

    if (!template) return false;

    if (
      current.templateIds.includes("*") ||
      current.queues.includes("*")
    ) {
      return true;
    }

    return (
      current.templateIds.includes(template.id) ||
      current.queues.includes(template.queue)
    );
  }

  function visibleTemplates() {
    return Templates
      .getAll()
      .filter(templateInScope);
  }

  function activeTemplate() {
    return Templates.get(activeTemplateId);
  }

  // FLOW STUDIO M1: PAGE SHELL
  function addRoleSelector() {
    if (
      document.getElementById(
        "adminRoleSelect"
      )
    ) {
      return;
    }

    const title =
      document.querySelector(
        ".flow-studio-title"
      );

    if (!title) return;

    title.insertAdjacentHTML(
      "afterend",
      `
        <aside
          class="flow-role-panel"
          aria-labelledby="flowRoleLabel"
        >
          <div class="flow-role-panel-header">
            <div>
              <div
                class="eyebrow"
                id="flowRoleLabel"
              >
                View as
              </div>

              <strong>Flow Studio role</strong>
            </div>

            <span
              class="badge badge-purple"
              id="flowRoleBadge"
            >
              Enterprise scope
            </span>
          </div>

          <label
            class="sr-only"
            for="adminRoleSelect"
          >
            View Flow Studio as
          </label>

          <select
            class="select"
            id="adminRoleSelect"
          >
            <option value="platform-admin">
              Megan Delia — Enterprise Administrator
            </option>

            <option value="category-owner">
              IT Request Category Owner
            </option>

            <option value="queue-manager">
              IT Help Desk Queue Manager
            </option>
          </select>

          <p
            class="flow-role-description"
            id="flowRoleDescription"
          ></p>

          <div
            class="flow-role-scope"
            id="flowRoleScope"
          ></div>
        </aside>
      `
    );
  }

  function addFlowTest() {
    if (
      document.getElementById(
        "flowTestCard"
      )
    ) {
      return;
    }

    const manager =
      document.querySelector(
        ".template-manager"
      );

    if (!manager) return;

    manager.insertAdjacentHTML(
      "beforebegin",
      `
        <section
          class="card flow-test-card mt-18"
          id="flowTestCard"
          aria-labelledby="flowTestTitle"
        >
          <div class="card-header">
            <div>
              <div class="eyebrow">
                Test
              </div>

              <h2 id="flowTestTitle">
                Try an employee request
              </h2>

              <p>
                Run the live request engine without
                creating a ticket.
              </p>
            </div>

            <span class="badge badge-teal">
              Live request engine
            </span>
          </div>

          <div class="card-body">
            <form
              class="flow-test-form"
              id="flowTestForm"
            >
              <div class="field">
                <label for="flowTestInput">
                  Employee says
                </label>

                <input
                  class="input"
                  id="flowTestInput"
                  value="Paper jam"
                  autocomplete="off"
                  required
                >
              </div>

              <button
                class="btn btn-primary"
                type="submit"
              >
                Test flow
              </button>
            </form>

            <div
              class="flow-test-result"
              id="flowTestResult"
              aria-live="polite"
            ></div>
          </div>
        </section>
      `
    );
  }

  function updateRoleSummary() {
    const current = role();

    const select =
      document.getElementById(
        "adminRoleSelect"
      );

    const badge =
      document.getElementById(
        "flowRoleBadge"
      );

    document.body.dataset.flowStudioRole =
      roleId;

    if (select) {
      select.value = roleId;
    }

    if (badge) {
      badge.className =
        `badge ${current.badgeClass}`;

      badge.textContent =
        current.badge;
    }

    document.getElementById(
      "flowRoleDescription"
    ).textContent =
      current.description;

    document.getElementById(
      "flowRoleScope"
    ).textContent =
      `${visibleTemplates().length} of ` +
      `${Templates.getAll().length} ` +
      "request flows visible";
  }

  // FLOW STUDIO M1: ROLE-SCOPED TEMPLATE ACCESS
  function rememberActiveTemplate() {
    const activeButton =
      document.querySelector(
        "#templateList " +
        "[data-template-id].active, " +
        "#templateList " +
        '[data-template-id][aria-selected="true"]'
      );

    if (activeButton) {
      activeTemplateId =
        activeButton.dataset.templateId;
    }
  }

  function applyListScope() {
    const allowed = new Set(
      visibleTemplates().map(
        (template) => template.id
      )
    );

    document
      .querySelectorAll(
        "#templateList [data-template-id]"
      )
      .forEach((button) => {
        button.hidden =
          !allowed.has(
            button.dataset.templateId
          );
      });

    const count =
      document.getElementById(
        "templateCount"
      );

    if (count) {
      count.textContent =
        `${allowed.size} visible of ` +
        `${Templates.getAll().length} ` +
        "configured request types";
    }

    if (!allowed.has(activeTemplateId)) {
      const first = Array.from(
        document.querySelectorAll(
          "#templateList [data-template-id]"
        )
      ).find(
        (button) => !button.hidden
      );

      if (first) {
        activeTemplateId =
          first.dataset.templateId;

        first.click();
      }
    }
  }

  function setDisabled(
    control,
    forced
  ) {
    if (
      !control.dataset
        .flowStudioOriginalDisabled
    ) {
      control.dataset
        .flowStudioOriginalDisabled =
          control.disabled
            ? "true"
            : "false";
    }

    control.disabled =
      control.dataset
        .flowStudioOriginalDisabled ===
        "true" ||
      forced;
  }

  function ensurePermissionBanner() {
    if (
      document.getElementById(
        "flowEditorPermissionBanner"
      )
    ) {
      return;
    }

    const header =
      document.querySelector(
        "#templateForm .card-header"
      );

    if (!header) return;

    header.insertAdjacentHTML(
      "afterend",
      `
        <div
          class="flow-permission-banner"
          id="flowEditorPermissionBanner"
        >
          <strong
            id="flowPermissionTitle"
          ></strong>

          <span
            id="flowPermissionDetail"
          ></span>
        </div>
      `
    );
  }

  function permissionCopy(inScope) {
    if (!inScope) {
      return [
        "none",
        "Outside this role's scope",
        "Choose a request flow owned or managed by the selected role."
      ];
    }

    if (!role().canEdit) {
      return [
        "read-only",
        "Read-only queue view",
        "Queue Managers can inspect and test this flow, but cannot change request design or governed behavior."
      ];
    }

    if (!role().canEditGoverned) {
      return [
        "limited-edit",
        "Owned-flow editing",
        "Wording, recognition, questions, options, and work-readiness content are editable. Catalog, queue, priority, SLA, and technical bindings are locked."
      ];
    }

    return [
      "full-edit",
      "Enterprise administrator editing",
      "All request-flow settings are editable in this prototype."
    ];
  }

  function applyEditorPermissions() {
    const form =
      document.getElementById(
        "templateForm"
      );

    if (!form) return;

    ensurePermissionBanner();
    rememberActiveTemplate();

    const inScope =
      templateInScope(
        activeTemplate()
      );

    const canEdit =
      inScope &&
      role().canEdit;

    const [
      access,
      title,
      detail
    ] = permissionCopy(inScope);

    form.dataset.flowAccess =
      access;

    document.getElementById(
      "flowEditorPermissionBanner"
    ).dataset.access =
      access;

    document.getElementById(
      "flowPermissionTitle"
    ).textContent =
      title;

    document.getElementById(
      "flowPermissionDetail"
    ).textContent =
      detail;

    form
      .querySelectorAll(
        "input, select, textarea, button"
      )
      .forEach((control) =>
        setDisabled(
          control,
          !canEdit
        )
      );

    form
      .querySelectorAll(
        ".flow-governed-field"
      )
      .forEach((field) =>
        field.classList.remove(
          "flow-governed-field"
        )
      );

    if (
      canEdit &&
      !role().canEditGoverned
    ) {
      form
        .querySelectorAll(
          CATEGORY_OWNER_LOCKS.join(",")
        )
        .forEach((control) => {
          setDisabled(
            control,
            true
          );

          const field =
            control.closest(".field");

          if (field) {
            field.classList.add(
              "flow-governed-field"
            );
          }
        });
    }

    const save =
      form.querySelector(
        'button[type="submit"]'
      );

    if (save) {
      save.hidden =
        !canEdit;

      setDisabled(
        save,
        !canEdit
      );
    }

    const reset =
      document.getElementById(
        "resetTemplates"
      );

    if (reset) {
      reset.disabled =
        !role().canReset;

      reset.title =
        role().canReset
          ? "Restore prototype template defaults"
          : "Only Megan Delia can reset company flow configuration";
    }
  }

  function restoreGovernedValues() {
    const template =
      activeTemplate();

    if (!template) return;

    const values = {
      templateCatalog:
        template.catalog || "",

      templateQueue:
        template.queue || "",

      templatePriority:
        template.priority || "",

      responseSla:
        template.responseSlaHours == null
          ? ""
          : template.responseSlaHours,

      resolutionSla:
        template.resolutionSlaHours == null
          ? ""
          : template.resolutionSlaHours
    };

    Object.entries(values).forEach(
      ([id, value]) => {
        const control =
          document.getElementById(id);

        if (control) {
          control.value = value;
        }
      }
    );
  }

  function applyRoleState() {
    renderQueued = false;

    rememberActiveTemplate();
    updateRoleSummary();
    applyListScope();
    applyEditorPermissions();
  }

  function scheduleRoleState() {
    if (renderQueued) return;

    renderQueued = true;

    window.requestAnimationFrame(
      applyRoleState
    );
  }

  function changeRole(nextRoleId) {
    roleId =
      ROLE_IDS.has(nextRoleId)
        ? nextRoleId
        : "platform-admin";

    window.localStorage.setItem(
      ROLE_KEY,
      roleId
    );

    const search =
      document.getElementById(
        "templateSearch"
      );

    if (search) {
      search.value = "";

      search.dispatchEvent(
        new Event(
          "input",
          { bubbles: true }
        )
      );
    }

    scheduleRoleState();

    window.setTimeout(
      applyRoleState,
      0
    );

    UI.showToast(
      `Flow Studio is now showing the ${role().label} view.`
    );
  }

  // FLOW STUDIO M1: LIVE ENGINE TEST
  function hasValue(value) {
    return Array.isArray(value)
      ? value.length > 0
      : String(
          value == null ? "" : value
        ).trim() !== "";
  }

  function diagnosticAnswers(
    result,
    template
  ) {
    const answers = {};

    const questions =
      template.diagnostics &&
      Array.isArray(
        template.diagnostics.questions
      )
        ? template.diagnostics.questions
        : [];

    const supplied =
      result.diagnosticAnswers ||
      result.extractedDiagnostics ||
      {};

    const input =
      String(
        result.originalText || ""
      ).toLowerCase();

    questions.forEach(
      (question) => {
        let value =
          supplied[question.id] ||
          (
            result.extractedFields ||
            {}
          )[question.id] ||
          (
            result.fieldAnswers ||
            {}
          )[question.id] ||
          "";

        if (
          value &&
          typeof value === "object"
        ) {
          value =
            value.value || "";
        }

        if (
          !hasValue(value) &&
          question.signals
        ) {
          Object.entries(
            question.signals
          ).some(
            ([answer, phrases]) => {
              const matched =
                (phrases || []).some(
                  (phrase) =>
                    input.includes(
                      String(
                        phrase
                      ).toLowerCase()
                    )
                );

              if (matched) {
                value = answer;
              }

              return matched;
            }
          );
        }

        if (hasValue(value)) {
          answers[question.id] = {
            id: question.id,

            label:
              question.reportLabel ||
              question.label ||
              question.id,

            value
          };
        }
      }
    );

    return answers;
  }

  function testEvidence(
    result,
    template
  ) {
    const excluded = new Set([
      "shortDescription",
      "description",
      "requestedFor",
      "attachments"
    ]);

    const evidence = [];
    const seen = new Set();

    Object.values(
      result.extractionDetails || {}
    ).forEach((detail) => {
      if (
        !detail ||
        excluded.has(detail.fieldId) ||
        !hasValue(detail.value)
      ) {
        return;
      }

      const key =
        String(
          detail.label ||
          detail.fieldId
        ).toLowerCase();

      if (seen.has(key)) return;

      seen.add(key);

      evidence.push(
        `${
          detail.label ||
          detail.fieldId
        }: ${detail.value}`
      );
    });

    Object.values(
      diagnosticAnswers(
        result,
        template
      )
    ).forEach((detail) => {
      const key =
        detail.label.toLowerCase();

      if (seen.has(key)) return;

      seen.add(key);

      evidence.push(
        `${detail.label}: ${detail.value}`
      );
    });

    return evidence.slice(0, 6);
  }

  function testMissing(
    result,
    template
  ) {
    const missing =
      (
        result.missingFields ||
        []
      ).map((field) => ({
        id: field.id,
        label:
          field.label ||
          field.id
      }));

    const answers =
      diagnosticAnswers(
        result,
        template
      );

    const required =
      template.diagnostics &&
      Array.isArray(
        template.diagnostics
          .requiredForWork
      )
        ? template.diagnostics
            .requiredForWork
        : [];

    const questions =
      template.diagnostics &&
      Array.isArray(
        template.diagnostics.questions
      )
        ? template.diagnostics.questions
        : [];

    required.forEach((id) => {
      if (
        answers[id] ||
        missing.some(
          (item) => item.id === id
        )
      ) {
        return;
      }

      const question =
        questions.find(
          (item) =>
            item.id === id
        );

      missing.push({
        id,

        label: question
          ? (
              question.reportLabel ||
              question.label ||
              id
            )
          : id
      });
    });

    return missing;
  }

  function routingReadiness(
    result
  ) {
    const routingValue =
      result.routingReadiness;

    const direct =
      routingValue &&
      typeof routingValue === "object"
        ? Number(
            routingValue.percent
          )
        : Number(routingValue);

    if (Number.isFinite(direct)) {
      return Math.max(
        0,
        Math.min(
          100,
          Math.round(direct)
        )
      );
    }

    if (result.requiresP1) {
      return 100;
    }

    if (
      result.template &&
      result.template.id ===
        "general-triage"
    ) {
      return Math.min(
        50,
        Number(
          result.confidence || 0
        )
      );
    }

    return Math.max(
      0,
      Math.round(
        Number(
          result.confidence || 0
        ) -
        Math.min(
          40,
          (
            result.missingFields ||
            []
          ).length * 12
        )
      )
    );
  }

  function workReadiness(
    result,
    template
  ) {
    const workValue =
      result.workReadiness;

    const direct =
      workValue &&
      typeof workValue === "object"
        ? Number(
            workValue.percent
          )
        : Number(workValue);

    if (Number.isFinite(direct)) {
      return Math.max(
        0,
        Math.min(
          100,
          Math.round(direct)
        )
      );
    }

    const fields =
      (
        template.fields ||
        []
      ).filter(
        (field) =>
          field.required &&
          ![
            "requestedFor",
            "attachments"
          ].includes(field.id)
      );

    const diagnostics =
      template.diagnostics &&
      Array.isArray(
        template.diagnostics
          .requiredForWork
      )
        ? template.diagnostics
            .requiredForWork
        : [];

    const answers =
      diagnosticAnswers(
        result,
        template
      );

    const extracted =
      result.extractedFields || {};

    const complete =
      fields.filter(
        (field) =>
          hasValue(
            extracted[field.id]
          )
      ).length +
      diagnostics.filter(
        (id) => answers[id]
      ).length;

    const total =
      fields.length +
      diagnostics.length;

    return total
      ? Math.round(
          (complete / total) * 100
        )
      : 100;
  }

  function list(
    items,
    emptyText
  ) {
    return items.length
      ? `
          <ul class="flow-test-list">
            ${items
              .map(
                (item) =>
                  `<li>${escapeHtml(item)}</li>`
              )
              .join("")}
          </ul>
        `
      : `
          <p class="flow-test-empty">
            ${escapeHtml(emptyText)}
          </p>
        `;
  }

  function receiverPreview(
    result,
    template,
    answers
  ) {
    const direct =
      result.receiverPreview ||
      (
        result.receiverBrief &&
        (
          result.receiverBrief.title ||
          result.receiverBrief.headline
        )
      );

    if (hasValue(direct)) {
      return direct;
    }

    const location =
      Object.values(
        result.extractionDetails || {}
      ).find(
        (detail) =>
          detail &&
          hasValue(detail.value) &&
          /location|station|area/i.test(
            `${detail.fieldId} ${detail.label}`
          )
      );

    const symptom =
      Object.values(
        answers
      ).find(
        (detail) =>
          /symptom|behavior|issue/i.test(
            `${detail.id} ${detail.label}`
          )
      );

    const subject =
      symptom
        ? symptom.value
        : String(
            result.initialText ||
            result.originalText ||
            template.name
          )
            .split(/[.!?]/)[0]
            .trim();

    return (
      `${subject} at ` +
      `${
        location
          ? location.value
          : "[location pending]"
      }`
    );
  }

  function renderTest(result) {
    const target =
      document.getElementById(
        "flowTestResult"
      );

    if (!target) return;

    if (!result || !result.ok) {
      target.innerHTML = `
        <div class="notice notice-warning">
          <span>!</span>

          <div>
            <strong>
              MasterFlow could not analyze that request.
            </strong>

            <p>
              ${escapeHtml(
                (
                  result &&
                  result.error
                ) ||
                "Enter a clearer request and try again."
              )}
            </p>
          </div>
        </div>
      `;

      return;
    }

    if (result.requiresP1) {
      target.innerHTML = `
        <div class="flow-test-overview">
          <div class="flow-test-metric">
            <small>Selected flow</small>
            <strong>
              Shipping Is Stopped fast lane
            </strong>
          </div>

          <div class="flow-test-metric">
            <small>Confidence</small>
            <strong>100%</strong>
          </div>

          <div class="flow-test-metric">
            <small>Route</small>
            <strong>
              ${escapeHtml(
                result.requestPlan.queue
              )}
            </strong>
          </div>
        </div>

        <dl class="flow-test-outcome">
          <div>
            <dt>
              Next employee question
            </dt>

            <dd>
              Normal AI intake is bypassed
              for the immediate P1 workflow.
            </dd>
          </div>

          <div>
            <dt>Receiver preview</dt>

            <dd>
              ${escapeHtml(
                result.originalText
              )}
            </dd>
          </div>
        </dl>
      `;

      return;
    }

    const template =
      result.template;

    const answers =
      diagnosticAnswers(
        result,
        template
      );

    const evidence =
      testEvidence(
        result,
        template
      );

    const missing =
      testMissing(
        result,
        template
      );

    const route =
      (
        result.requestPlan &&
        result.requestPlan.queue
      ) ||
      template.queue;

    const routing =
      routingReadiness(result);

    const work =
      workReadiness(
        result,
        template
      );

    const firstDiagnostic =
      template.diagnostics &&
      template.diagnostics.questions
        ? template.diagnostics.questions.find(
            (question) =>
              missing.some(
                (item) =>
                  item.id ===
                  question.id
              )
          )
        : null;

    const nextQuestion =
      (
        result.clarificationQuestions &&
        result.clarificationQuestions[0] &&
        result.clarificationQuestions[0]
          .question
      ) ||
      (
        firstDiagnostic &&
        firstDiagnostic.question
      ) ||
      "No additional employee question is required.";

    target.innerHTML = `
      <div class="flow-test-overview">
        <div class="flow-test-metric">
          <small>Selected flow</small>
          <strong>
            ${escapeHtml(template.name)}
          </strong>
        </div>

        <div class="flow-test-metric">
          <small>Confidence</small>

          <strong>
            ${Math.round(
              Number(
                result.confidence || 0
              )
            )}%
          </strong>
        </div>

        <div class="flow-test-metric">
          <small>Route</small>
          <strong>
            ${escapeHtml(route)}
          </strong>
        </div>
      </div>

      <div class="flow-readiness-grid">
        <div class="flow-readiness-item">
          <div>
            <span>
              Routing readiness
            </span>

            <strong>
              ${routing}%
            </strong>
          </div>

          <div
            class="flow-readiness-meter"
            role="progressbar"
            aria-label="Routing readiness"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${routing}"
          >
            <span
              style="width:${routing}%"
            ></span>
          </div>
        </div>

        <div class="flow-readiness-item">
          <div>
            <span>
              Work readiness
            </span>

            <strong>
              ${work}%
            </strong>
          </div>

          <div
            class="flow-readiness-meter"
            role="progressbar"
            aria-label="Work readiness"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${work}"
          >
            <span
              style="width:${work}%"
            ></span>
          </div>
        </div>
      </div>

      <div class="flow-test-detail-grid">
        <section class="flow-test-section">
          <h3>Detected evidence</h3>

          ${list(
            evidence,
            "No work detail was detected yet."
          )}
        </section>

        <section class="flow-test-section">
          <h3>Still needed</h3>

          ${list(
            missing.map(
              (item) => item.label
            ),
            "Nothing else is required before review."
          )}
        </section>
      </div>

      <dl class="flow-test-outcome">
        <div>
          <dt>
            Next employee question
          </dt>

          <dd>
            ${escapeHtml(nextQuestion)}
          </dd>
        </div>

        <div>
          <dt>Receiver preview</dt>

          <dd>
            ${escapeHtml(
              receiverPreview(
                result,
                template,
                answers
              )
            )}
          </dd>
        </div>
      </dl>
    `;
  }

  function runTest(text) {
    const target =
      document.getElementById(
        "flowTestResult"
      );

    if (target) {
      target.innerHTML = `
        <div class="flow-test-loading">
          Analyzing request...
        </div>
      `;
    }

    try {
      renderTest(
        Engine.analyze(text)
      );
    } catch (error) {
      console.error(
        "MasterFlow Flow Studio test failed",
        error
      );

      renderTest({
        ok: false,
        error:
          "The live request engine returned an error."
      });
    }
  }

  // FLOW STUDIO M1: INITIALIZATION
  addRoleSelector();
  addFlowTest();

  document.getElementById(
    "adminRoleSelect"
  ).addEventListener(
    "change",
    (event) =>
      changeRole(
        event.target.value
      )
  );

  document.getElementById(
    "flowTestForm"
  ).addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      const input =
        document.getElementById(
          "flowTestInput"
        );

      const text =
        input.value.trim();

      if (!text) {
        input.focus();

        UI.showToast(
          "Enter an employee request before testing the flow."
        );

        return;
      }

      runTest(text);
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      const templateButton =
        event.target.closest(
          "#templateList [data-template-id]"
        );

      if (templateButton) {
        const template =
          Templates.get(
            templateButton.dataset
              .templateId
          );

        if (
          !templateInScope(template)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();

          UI.showToast(
            "That request flow is outside the selected role's scope."
          );

          return;
        }

        activeTemplateId =
          templateButton.dataset
            .templateId;

        scheduleRoleState();
      }

      if (
        event.target.closest(
          "#resetTemplates"
        ) &&
        !role().canReset
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();

        UI.showToast(
          "Only Megan Delia can reset company request-flow configuration."
        );
      }
    },
    true
  );

  document.addEventListener(
    "submit",
    (event) => {
      if (
        event.target.id !==
        "templateForm"
      ) {
        return;
      }

      if (
        !templateInScope(
          activeTemplate()
        ) ||
        !role().canEdit
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();

        UI.showToast(
          "This role can review and test the flow, but cannot edit it."
        );

        return;
      }

      if (
        !role().canEditGoverned
      ) {
        restoreGovernedValues();
      }
    },
    true
  );

  const manager =
    document.querySelector(
      ".template-manager"
    );

  if (manager) {
    new MutationObserver(
      scheduleRoleState
    ).observe(
      manager,
      {
        childList: true,
        subtree: true
      }
    );
  }

  window.addEventListener(
    "masterflow:templates",
    scheduleRoleState
  );

  rememberActiveTemplate();
  applyRoleState();
  runTest("Paper jam");
})();
