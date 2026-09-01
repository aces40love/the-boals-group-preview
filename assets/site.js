document.documentElement.classList.replace("no-js", "js");

const navToggle = document.querySelector("[data-nav-toggle]");
const siteNav = document.querySelector("[data-site-nav]");

function navigationIsOpen() {
  return navToggle?.getAttribute("aria-expanded") === "true";
}

function navigationFocusables() {
  if (!navToggle || !siteNav) return [];
  return [
    navToggle,
    ...siteNav.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  ];
}

function setNavigation(open, { focusFirst = false, restoreFocus = false } = {}) {
  if (!navToggle || !siteNav) return;
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.querySelector(".sr-only").textContent = open ? "Close navigation" : "Open navigation";
  siteNav.classList.toggle("is-open", open);
  document.body.classList.toggle("nav-open", open);

  if (open && focusFirst) {
    window.requestAnimationFrame(() => {
      if (navigationIsOpen()) navigationFocusables()[1]?.focus();
    });
  } else if (!open && restoreFocus) {
    navToggle.focus();
  }
}

navToggle?.addEventListener("click", () => {
  const open = !navigationIsOpen();
  setNavigation(open, { focusFirst: open });
});

siteNav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setNavigation(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigationIsOpen()) {
    event.preventDefault();
    setNavigation(false, { restoreFocus: true });
    return;
  }

  if (event.key !== "Tab" || !navigationIsOpen() || window.innerWidth > 900) return;
  const focusables = navigationFocusables();
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !focusables.includes(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !focusables.includes(active))) {
    event.preventDefault();
    first.focus();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900 && navigationIsOpen()) setNavigation(false);
});

document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});

const revealItems = [...document.querySelectorAll(".reveal")];
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const initialObserverBottom = window.innerHeight * 0.93;
  const revealThreshold = 0.08;
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -7% 0px", threshold: revealThreshold },
  );
  revealItems.forEach((item) => {
    const bounds = item.getBoundingClientRect();
    const visibleHeight = Math.max(
      0,
      Math.min(bounds.bottom, initialObserverBottom) - Math.max(bounds.top, 0),
    );
    const initialVisibleRatio = visibleHeight / Math.max(bounds.height, 1);
    if (initialVisibleRatio < revealThreshold) {
      item.classList.add("is-visible");
      return;
    }
    revealObserver.observe(item);
  });
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const countyFinder = document.querySelector("[data-county-finder]");
if (countyFinder) {
  const input = countyFinder.querySelector("[data-county-search]");
  const clear = countyFinder.querySelector("[data-clear-search]");
  const status = countyFinder.querySelector("[data-county-result]");
  const empty = countyFinder.querySelector("[data-county-empty]");
  const counties = [...countyFinder.querySelectorAll("[data-county]")];

  const filterCounties = () => {
    const term = input.value.trim().toLowerCase().replace(/\s+county$/, "");
    let matches = 0;
    counties.forEach((county) => {
      const match = !term || county.dataset.name.includes(term);
      county.hidden = !match;
      if (match) matches += 1;
    });
    clear.hidden = !term;
    empty.hidden = matches !== 0;
    status.textContent = term
      ? matches === 1
        ? `1 covered county matches “${input.value.trim()}”.`
        : `${matches} covered counties match “${input.value.trim()}”.`
      : "Showing all 62 covered counties.";
  };

  input.addEventListener("input", filterCounties);
  clear.addEventListener("click", () => {
    input.value = "";
    filterCounties();
    input.focus();
  });
}

const proposalForm = document.querySelector("[data-proposal-form]");
if (proposalForm) {
  const status = proposalForm.querySelector("[data-form-status]");
  const submitButton = proposalForm.querySelector('button[type="submit"]');
  const submitLabel = submitButton?.querySelector("[data-submit-label]") || submitButton?.querySelector("span");
  const honeypot = proposalForm.querySelector("[data-honeypot]");
  const turnstileMount = proposalForm.querySelector("[data-turnstile]");
  const turnstileStatus = proposalForm.querySelector("[data-turnstile-status]");
  const controls = [...proposalForm.querySelectorAll("input, select, textarea")].filter(
    (control) => control !== honeypot,
  );
  const endpoint = proposalForm.dataset.endpoint || "/api/request.php";
  const turnstileConfigEndpoint = proposalForm.dataset.turnstileConfig || "/api/turnstile-config.php";
  const fallbackAddress = proposalForm.dataset.fallbackEmail || "";
  const fieldLimits = {
    name: 120,
    organization: 160,
    email: 254,
    phone: 50,
    property: 300,
    county: 100,
    intendedUsers: 300,
    message: 4000,
  };
  let submitting = false;
  let turnstileToken = "";
  let turnstileWidgetId = null;

  // Requests use the private same-origin endpoint. The adjacent direct-email
  // link remains available if JavaScript or delivery is unavailable.
  proposalForm.noValidate = true;
  proposalForm.setAttribute("aria-busy", "false");

  status.id ||= "proposal-form-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");

  const describedBy = (control) => {
    const ids = new Set((control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    return ids;
  };

  controls.forEach((control, index) => {
    const limit = fieldLimits[control.name];
    if (limit && "maxLength" in control) control.maxLength = limit;

    const fieldError = control.nextElementSibling;
    if (fieldError?.classList.contains("field-error")) {
      fieldError.id ||= `proposal-field-error-${index + 1}`;
      const ids = describedBy(control);
      ids.add(fieldError.id);
      control.setAttribute("aria-describedby", [...ids].join(" "));
    }
  });

  const setStatus = (message, { error = false, focus = false } = {}) => {
    status.textContent = message;
    status.hidden = !message;
    if (message) status.dataset.state = error ? "error" : focus ? "success" : "info";
    else delete status.dataset.state;
    status.setAttribute("role", error ? "alert" : "status");
    status.setAttribute("aria-live", error ? "assertive" : "polite");
    if (message && focus) status.focus();
  };

  const setTurnstileStatus = (message, state = "loading") => {
    if (!turnstileStatus) return;
    turnstileStatus.textContent = message;
    turnstileStatus.dataset.state = state;
  };

  const updateSubmitState = () => {
    if (submitButton) submitButton.disabled = submitting || !turnstileToken;
  };

  const setSubmitting = (active) => {
    submitting = active;
    proposalForm.setAttribute("aria-busy", String(active));
    if (submitLabel) submitLabel.textContent = active ? "Sending request…" : "Prepare proposal request";
    updateSubmitState();
  };

  const loadTurnstileApi = () => {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);

    return new Promise((resolve, reject) => {
      const callbackName = "boalsTurnstileApiReady";
      const existing = document.querySelector("script[data-turnstile-api]");
      let script = existing;
      let settled = false;

      const cleanupCallback = () => {
        try {
          delete window[callbackName];
        } catch {
          window[callbackName] = undefined;
        }
      };

      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(loadTimeout);
        cleanupCallback();
        if (error) reject(error);
        else if (window.turnstile?.render) resolve(window.turnstile);
        else reject(new Error("Turnstile did not initialize"));
      };

      const loadTimeout = window.setTimeout(
        () => finish(new Error("Turnstile load timed out")),
        15_000,
      );

      window[callbackName] = () => {
        finish();
      };

      if (script) {
        script.addEventListener("error", () => {
          finish(new Error("Turnstile failed to load"));
        }, { once: true });
        return;
      }

      script = document.createElement("script");
      script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?onload=${callbackName}&render=explicit`;
      script.async = true;
      script.defer = true;
      script.dataset.turnstileApi = "";
      script.addEventListener("error", () => {
        finish(new Error("Turnstile failed to load"));
      }, { once: true });
      document.head.append(script);
    });
  };

  const resetTurnstile = () => {
    turnstileToken = "";
    updateSubmitState();
    if (turnstileWidgetId === null || !window.turnstile?.reset) return;
    setTurnstileStatus("Refreshing security verification…", "loading");
    try {
      window.turnstile.reset(turnstileWidgetId);
    } catch {
      setTurnstileStatus("Security verification is unavailable. Please reload or use direct email.", "error");
    }
  };

  const initializeTurnstile = async () => {
    if (!turnstileMount || !turnstileStatus) throw new Error("Turnstile mount is missing");

    const configController = new AbortController();
    const configTimeout = window.setTimeout(() => configController.abort(), 10_000);
    let configResponse;
    try {
      configResponse = await fetch(turnstileConfigEndpoint, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: configController.signal,
      });
    } finally {
      window.clearTimeout(configTimeout);
    }
    const publicConfig = await configResponse.json();
    if (!configResponse.ok || publicConfig?.ok !== true || typeof publicConfig.siteKey !== "string") {
      throw new Error("Turnstile configuration is unavailable");
    }

    const turnstile = await loadTurnstileApi();
    turnstileWidgetId = turnstile.render(turnstileMount, {
      sitekey: publicConfig.siteKey,
      action: "contact_request",
      appearance: "always",
      theme: "auto",
      size: window.matchMedia("(max-width: 430px)").matches ? "compact" : "flexible",
      "refresh-expired": "manual",
      "refresh-timeout": "manual",
      "response-field": false,
      callback: (token) => {
        turnstileToken = typeof token === "string" ? token : "";
        setTurnstileStatus(
          turnstileToken ? "Security verification complete." : "Security verification is required.",
          turnstileToken ? "success" : "error",
        );
        updateSubmitState();
      },
      "error-callback": () => {
        turnstileToken = "";
        setTurnstileStatus("Security verification is unavailable. Please reload or use direct email.", "error");
        updateSubmitState();
      },
      "expired-callback": () => {
        turnstileToken = "";
        setTurnstileStatus("Security verification expired. Refreshing…", "loading");
        updateSubmitState();
        window.setTimeout(resetTurnstile, 0);
      },
      "timeout-callback": () => {
        turnstileToken = "";
        setTurnstileStatus("Security verification timed out. Refreshing…", "loading");
        updateSubmitState();
        window.setTimeout(resetTurnstile, 0);
      },
      "unsupported-callback": () => {
        turnstileToken = "";
        setTurnstileStatus("This browser cannot run the security verification. Please use direct email.", "error");
        updateSubmitState();
      },
    });
    if (turnstileWidgetId === undefined || turnstileWidgetId === null) {
      throw new Error("Turnstile could not render");
    }
    setTurnstileStatus("Completing security verification…", "loading");
  };

  updateSubmitState();
  initializeTurnstile().catch(() => {
    turnstileToken = "";
    setTurnstileStatus("Security verification is unavailable. Please reload or use direct email.", "error");
    updateSubmitState();
  });

  const params = new URLSearchParams(window.location.search);
  const clientType = params.get("client");
  if (clientType) {
    const message = proposalForm.elements.message;
    message.value = `Client type: ${clientType.slice(0, 200)}\n\n`;
  }

  const updateValidity = (control) => {
    const valid = control.checkValidity();
    if (valid) control.removeAttribute("aria-invalid");
    else control.setAttribute("aria-invalid", "true");
    return valid;
  };

  controls.forEach((control) => {
    control.addEventListener("blur", () => updateValidity(control));
    control.addEventListener("input", () => {
      if (control.getAttribute("aria-invalid") === "true") updateValidity(control);
      if (!status.hidden && status.getAttribute("role") === "alert") setStatus("");
    });
    control.addEventListener("change", () => {
      if (control.getAttribute("aria-invalid") === "true") updateValidity(control);
      if (!status.hidden && status.getAttribute("role") === "alert") setStatus("");
    });
  });

  proposalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;

    const invalid = controls.filter((control) => !updateValidity(control));
    if (invalid.length) {
      const consentMissing = invalid.some((control) => control.name === "acknowledgement");
      setStatus(
        consentMissing
          ? "Please complete the highlighted fields and confirm the acknowledgement before sending."
          : "Please complete the highlighted fields before sending.",
        { error: true },
      );
      const ids = describedBy(invalid[0]);
      ids.add(status.id);
      invalid[0].setAttribute("aria-describedby", [...ids].join(" "));
      invalid[0].focus();
      return;
    }

    if (!turnstileToken) {
      setStatus("Please complete the security verification before sending.", { error: true });
      turnstileMount?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const values = Object.fromEntries(new FormData(proposalForm).entries());
    const payload = {
      name: values.name || "",
      organization: values.organization || "",
      email: values.email || "",
      phone: values.phone || "",
      property: values.property || "",
      propertyType: values.propertyType || "",
      purpose: values.purpose || "",
      county: values.county || "",
      deliveryDate: values.deliveryDate || "",
      intendedUsers: values.intendedUsers || "",
      message: values.message || "",
      acknowledgement: values.acknowledgement === "on",
      website: values.website || "",
      turnstileToken,
    };

    setSubmitting(true);
    turnstileToken = "";
    setStatus("Sending your request securely…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        // A proxy or server error page is deliberately not exposed to the visitor.
      }

      if (!response.ok || result?.ok !== true) {
        const error = new Error("Request delivery failed");
        error.code = result?.code || "delivery_failed";
        throw error;
      }

      proposalForm.reset();
      controls.forEach((control) => control.removeAttribute("aria-invalid"));
      setStatus("Your request was sent. The Boals Group will review the assignment details and follow up.", { focus: true });
    } catch (error) {
      const rateLimited = error?.code === "rate_limited";
      const verificationFailed = error?.code === "verification_failed";
      const verificationUnavailable = error?.code === "verification_unavailable";
      const alternative = fallbackAddress ? ` You can also email ${fallbackAddress} directly.` : " Please use the direct email link on this page.";
      setStatus(
        rateLimited
          ? `Please wait before trying again.${alternative}`
          : verificationFailed
            ? "Security verification expired or could not be confirmed. Wait for a fresh check, then try again."
            : verificationUnavailable
              ? `Security verification is temporarily unavailable.${alternative}`
          : `Delivery could not be confirmed. Please do not submit again immediately because the request may already have been received.${alternative}`,
        { error: true, focus: true },
      );
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
      resetTurnstile();
    }
  });
}
