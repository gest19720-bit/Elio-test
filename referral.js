/* =========================================================
   ELIO — REFERRAL SYSTEM
   Generates referral codes, reads/stores referral params,
   and powers the sharing UI on the success page.
   ========================================================= */

const REFERRAL_STORAGE_KEY = "elio_referral_code";
const REFERRED_BY_STORAGE_KEY = "elio_referred_by";

/**
 * Generates a short, unique-enough referral code.
 * Format: 3 letters + 3 numbers, e.g. "ABC123".
 */
function generateReferralCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion
  const numbers = "0123456789";
  let code = "";

  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }

  return code;
}

/**
 * Reads a ?ref=CODE parameter from the current URL, if present.
 * Used on the waitlist page to detect that a visitor was referred.
 */
function getReferralFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ref");
}

/**
 * Persists the referral code that brought this visitor in,
   so it survives the multi-step form until submission.
 */
function storeReferredBy(code) {
  if (!code) return;
  sessionStorage.setItem(REFERRED_BY_STORAGE_KEY, code);
}

function getStoredReferredBy() {
  return sessionStorage.getItem(REFERRED_BY_STORAGE_KEY);
}

/**
 * Builds the full shareable referral link for a given code.
 */
function buildReferralLink(code) {
  const baseUrl = window.location.origin + window.location.pathname.replace("success.html", "waitlist.html");
  return baseUrl + "?ref=" + encodeURIComponent(code);
}

/**
 * Prevents a user from being credited for referring themselves,
 * e.g. if they open their own referral link.
 */
function isSelfReferral(referredByCode, newUserEmail, storedEmailForCode) {
  if (!referredByCode) return false;
  return storedEmailForCode && storedEmailForCode === newUserEmail;
}

/**
 * If this signup arrived via a referral link, increments the
 * referrer's referral_count in Supabase. Safe to call even if
 * Supabase isn't configured yet (it will just no-op with a warning).
 */
async function creditReferrerIfApplicable(referredByCode) {
  if (!referredByCode) return;

  const client = getSupabaseClient();
  if (!client) return;

  try {
    // Look up the referrer by their referral_code
    const { data: referrer, error: lookupError } = await client
      .from("waitlist_users")
      .select("id, referral_count")
      .eq("referral_code", referredByCode)
      .single();

    if (lookupError || !referrer) {
      console.warn("Referral code not found, skipping credit:", referredByCode);
      return;
    }

    const { error: updateError } = await client
      .from("waitlist_users")
      .update({ referral_count: (referrer.referral_count || 0) + 1 })
      .eq("id", referrer.id);

    if (updateError) {
      console.error("Failed to credit referrer:", updateError);
    }
  } catch (err) {
    console.error("Referral credit error:", err);
  }
}

/**
 * Sets up the copy button, native share button, and individual
 * social share links on the success page.
 */
function initializeReferralSharing(referralCode) {
  const referralLink = buildReferralLink(referralCode);
  const shareText =
    "I'm joining the waitlist for Elio — an upcoming AI Back-Office Agent designed to help businesses handle repetitive work. Join me!";

  const linkInput = document.querySelector("#referral-link-input");
  if (linkInput) linkInput.value = referralLink;

  const copyBtn = document.querySelector("#copy-referral-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(referralLink);
        const original = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(function () {
          copyBtn.textContent = original;
        }, 2000);
      } catch (err) {
        // Fallback for browsers without clipboard API support
        linkInput.select();
        document.execCommand("copy");
      }
    });
  }

  const nativeShareBtn = document.querySelector("#native-share-btn");
  if (nativeShareBtn) {
    if (navigator.share) {
      nativeShareBtn.addEventListener("click", function () {
        navigator.share({
          title: "Join me on the Elio waitlist",
          text: shareText,
          url: referralLink,
        }).catch(function () {
          /* user cancelled share — no action needed */
        });
      });
    } else {
      nativeShareBtn.style.display = "none";
    }
  }

  const whatsappBtn = document.querySelector("#share-whatsapp");
  if (whatsappBtn) {
    whatsappBtn.href =
      "https://wa.me/?text=" + encodeURIComponent(shareText + " " + referralLink);
  }

  const twitterBtn = document.querySelector("#share-twitter");
  if (twitterBtn) {
    twitterBtn.href =
      "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(shareText) +
      "&url=" +
      encodeURIComponent(referralLink);
  }

  const linkedinBtn = document.querySelector("#share-linkedin");
  if (linkedinBtn) {
    linkedinBtn.href =
      "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(referralLink);
  }
}

/**
 * Updates the referral progress UI (dots + reward tiers) based
 * on how many people this user has referred so far.
 */
function renderReferralProgress(referralCount) {
  const countLabel = document.querySelector("#referral-count-label");
  if (countLabel) {
    countLabel.textContent = referralCount + " / 5 Referrals";
  }

  const dots = document.querySelectorAll(".progress-dots .dot");
  dots.forEach(function (dot, index) {
    if (index < referralCount) {
      dot.classList.add("is-filled");
    }
  });

  const rewardCards = document.querySelectorAll(".reward-card");
  const thresholds = [1, 3, 5];
  rewardCards.forEach(function (card, index) {
    if (referralCount >= thresholds[index]) {
      card.classList.add("is-unlocked");
    }
  });
}

/**
 * Drops a small, subtle burst of confetti pieces once on page load.
 * Kept brief and lightweight per the "don't overdo it" brief.
 */
function triggerConfetti() {
  const colors = ["#2563EB", "#60A5FA", "#14213D", "#F8FAFC"];
  const pieceCount = 40;

  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = 2.5 + Math.random() * 1.5 + "s";
    piece.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.appendChild(piece);

    // Clean up after the animation finishes
    setTimeout(function () {
      piece.remove();
    }, 4500);
  }
}

/**
 * Bootstraps the success page: reads the referral code generated
 * at signup, renders the referral link/sharing UI, fires a small
 * confetti moment, and displays current referral progress.
 */
function initializeSuccessPage() {
  const referralSection = document.querySelector(".referral-section");
  if (!referralSection) return; // not on the success page

  const referralCode = sessionStorage.getItem("elio_referral_code");
  const referralCount = Number(sessionStorage.getItem("elio_referral_count") || 0);

  if (referralCode) {
    initializeReferralSharing(referralCode);
  }

  renderReferralProgress(referralCount);
  triggerConfetti();
}

document.addEventListener("DOMContentLoaded", initializeSuccessPage);
