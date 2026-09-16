/* =========================================================
   ELIO — WAITLIST FORM
   Handles the 5-step waitlist form: navigation, validation,
   selectable option cards, and submission to Supabase.
   ========================================================= */

const TOTAL_STEPS = 5;
let currentStep = 1;

// Holds all answers as the user moves through the form
const waitlistData = {
  fullName: "",
  email: "",
  businessName: "",
  businessType: "",
  businessSize: "",
  biggestChallenges: [],
  currentTools: [],
  primaryProblem: "",
};

document.addEventListener("DOMContentLoaded", function () {
  captureReferralFromURL();
  initializeWaitlistForm();
});

/**
 * If the visitor arrived via a referral link (?ref=CODE),
 * remember it for when the form is submitted.
 */
function captureReferralFromURL() {
  const refCode = getReferralFromURL();
  if (refCode) {
    storeReferredBy(refCode);
  }
}

/**
 * Sets up all interactive behavior for the multi-step form:
 * option card selection, step navigation, and final submission.
 */
function initializeWaitlistForm() {
  const form = document.querySelector("#waitlist-form");
  if (!form) return;

  initializeOptionCards();
  initializeStepButtons();
  updateProgress();
}

/**
 * Makes single-select and multi-select "option cards" clickable,
 * toggling a visual selected state and updating waitlistData.
 */
function initializeOptionCards() {
  document.querySelectorAll(".option-card").forEach(function (card) {
    card.addEventListener("click", function () {
      const group = card.closest("[data-field]");
      if (!group) return;

      const field = group.dataset.field;
      const multi = group.dataset.multi === "true";
      const value = card.dataset.value;

      if (multi) {
        card.classList.toggle("is-selected");
        waitlistData[field] = Array.from(
          group.querySelectorAll(".option-card.is-selected")
        ).map(function (el) {
          return el.dataset.value;
        });
      } else {
        group.querySelectorAll(".option-card").forEach(function (el) {
          el.classList.remove("is-selected");
        });
        card.classList.add("is-selected");
        waitlistData[field] = value;
      }

      clearFieldError(group);
    });
  });
}

/**
 * Wires up all "Continue", "Back", and the final "Join the
 * Waitlist" buttons for each step of the form.
 */
function initializeStepButtons() {
  document.querySelectorAll("[data-action='next']").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (validateCurrentStep()) {
        moveToNextStep();
      }
    });
  });

  document.querySelectorAll("[data-action='back']").forEach(function (btn) {
    btn.addEventListener("click", moveToPreviousStep);
  });

  const submitBtn = document.querySelector("[data-action='submit']");
  if (submitBtn) {
    submitBtn.addEventListener("click", function (event) {
      event.preventDefault();
      if (validateCurrentStep()) {
        submitWaitlistForm(submitBtn);
      }
    });
  }
}

/**
 * Validates only the fields visible on the current step.
 * Returns true if the step is valid, false otherwise
 * (and displays inline error messages).
 */
function validateCurrentStep() {
  let isValid = true;
  const stepEl = document.querySelector('.form-step[data-step="' + currentStep + '"]');
  if (!stepEl) return true;

  // Step 1: required text inputs
  if (currentStep === 1) {
    const fullName = document.querySelector("#full-name");
    const email = document.querySelector("#email");
    const businessName = document.querySelector("#business-name");

    if (!fullName.value.trim()) {
      showFieldError(fullName, "Please enter your full name.");
      isValid = false;
    } else {
      waitlistData.fullName = fullName.value.trim();
      clearFieldError(fullName);
    }

    if (!isValidEmail(email.value.trim())) {
      showFieldError(email, "Please enter a valid email address.");
      isValid = false;
    } else {
      waitlistData.email = email.value.trim();
      clearFieldError(email);
    }

    if (!businessName.value.trim()) {
      showFieldError(businessName, "Please enter your business name.");
      isValid = false;
    } else {
      waitlistData.businessName = businessName.value.trim();
      clearFieldError(businessName);
    }
  }

  // Step 2: business type + size (single-select option cards)
  if (currentStep === 2) {
    if (!waitlistData.businessType) {
      isValid = false;
      flashGroupError(stepEl, '[data-field="businessType"]');
    }
    if (!waitlistData.businessSize) {
      isValid = false;
      flashGroupError(stepEl, '[data-field="businessSize"]');
    }
  }

  // Step 3: at least one challenge selected
  if (currentStep === 3) {
    if (!waitlistData.biggestChallenges.length) {
      isValid = false;
      flashGroupError(stepEl, '[data-field="biggestChallenges"]');
    }
  }

  // Step 4: tools are optional-ish but encouraged — no hard requirement
  // Step 5: optional textarea, always valid
  if (currentStep === 5) {
    const textarea = document.querySelector("#primary-problem");
    waitlistData.primaryProblem = textarea ? textarea.value.trim() : "";
  }

  return isValid;
}

function isValidEmail(value) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(value);
}

function showFieldError(inputEl, message) {
  const field = inputEl.closest(".form-field");
  if (!field) return;
  field.classList.add("has-error");
  const errorEl = field.querySelector(".field-error");
  if (errorEl) errorEl.textContent = message;
}

function clearFieldError(el) {
  const field = el.classList.contains("form-field") ? el : el.closest(".form-field");
  if (field) field.classList.remove("has-error");
}

/**
 * Briefly highlights an option-card group to signal that a
 * selection is required before continuing.
 */
function flashGroupError(stepEl, selector) {
  const group = stepEl.querySelector(selector);
  if (!group) return;
  group.style.outline = "1px solid #DC2626";
  group.style.borderRadius = "16px";
  setTimeout(function () {
    group.style.outline = "none";
  }, 1200);
}

/**
 * Advances to the next step, updating visibility and progress.
 */
function moveToNextStep() {
  if (currentStep >= TOTAL_STEPS) return;
  setStep(currentStep + 1);
}

/**
 * Returns to the previous step without losing entered data.
 */
function moveToPreviousStep() {
  if (currentStep <= 1) return;
  setStep(currentStep - 1);
}

function setStep(stepNumber) {
  document.querySelectorAll(".form-step").forEach(function (stepEl) {
    stepEl.classList.toggle("is-active", Number(stepEl.dataset.step) === stepNumber);
  });
  currentStep = stepNumber;
  updateProgress();

  const formCard = document.querySelector(".form-card");
  if (formCard) formCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateProgress() {
  const label = document.querySelector("#progress-label");
  const fill = document.querySelector("#progress-fill");
  const percent = document.querySelector(".progress-percent");
  const progressValue = Math.round((currentStep / TOTAL_STEPS) * 100);

  if (label) label.textContent = "Step " + currentStep + " of " + TOTAL_STEPS;
  if (fill) fill.style.width = progressValue + "%";
  if (percent) percent.textContent = progressValue + "%";
}

/**
 * Sends the collected form data to Supabase, generates a
 * referral code, credits any referrer, and redirects to the
 * success page. Guards against duplicate submissions.
 */
async function submitWaitlistForm(submitBtn) {
  if (submitBtn.classList.contains("is-loading")) return; // prevent double submit
  submitBtn.classList.add("is-loading");
  submitBtn.disabled = true;

  const messageEl = document.querySelector("#form-message");
  if (messageEl) {
    messageEl.classList.remove("is-error");
    messageEl.textContent = "";
  }

  const referredBy = getStoredReferredBy();
  

  /* const payload = {
    full_name: waitlistData.fullName,
    email: waitlistData.email,
    business_name: waitlistData.businessName,
    business_type: waitlistData.businessType,
    business_size: waitlistData.businessSize,
    biggest_challenges: waitlistData.biggestChallenges,
    current_tools: waitlistData.currentTools,
    primary_problem: waitlistData.primaryProblem,
    referral_code: referralCode,
    referred_by: referredBy || null,
  }; */

  try {
    const client = getSupabaseClient();

    if (!client) throw new Error("Waitlist backend is not configured yet.");
    const { data, error } = await client.rpc("join_waitlist", {
      p_full_name: waitlistData.fullName,
      p_email: waitlistData.email,
      p_business_name: waitlistData.businessName,
      p_business_type: waitlistData.businessType,
      p_business_size: waitlistData.businessSize,
      p_biggest_challenges: waitlistData.biggestChallenges,
      p_current_tools: waitlistData.currentTools,
      p_primary_problem: waitlistData.primaryProblem || null,
      p_referred_by: referredBy || null,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || !result.referral_code) throw new Error("Incomplete waitlist response.");
    sessionStorage.setItem("elio_referral_code", result.referral_code);
    sessionStorage.setItem("elio_referral_count", String(result.referral_count || 0));

    /*

    if (client) {
      const { error } = await client.from("waitlist_users").insert([payload]);
      if (error) throw error;

      // Prevent crediting a referral if someone somehow refers themselves
      if (referredBy) {
        await creditReferrerIfApplicable(referredBy);
      }
    } else {
      // Supabase isn't configured yet — log locally so the flow
      // can still be demoed/tested end-to-end.
      console.warn("Supabase not configured. Waitlist payload:", payload);
    }

    // Pass what the success page needs along via sessionStorage
    sessionStorage.setItem("elio_referral_code", referralCode);
    sessionStorage.setItem("elio_referral_count", "0");
    */
    window.location.href = "success.html";
  } catch (err) {
    console.error("Waitlist submission failed:", err);
    submitBtn.classList.remove("is-loading");
    submitBtn.disabled = false;

    if (messageEl) {
      messageEl.classList.add("is-error");
      messageEl.textContent =
        "Something went wrong while saving your details. Please try again.";
    }
  }
}
