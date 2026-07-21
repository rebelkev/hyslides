import { MAX_ENGAGEMENT_OPTIONS } from "./schema.js";

export const engagementTypes = [
  { value: "poll", label: "Live poll" },
  { value: "multipleChoice", label: "Multiple choice" },
  { value: "wordCloud", label: "Word cloud" },
  { value: "qna", label: "Q&A" },
  { value: "quiz", label: "Quiz" },
  { value: "reactions", label: "Emoji reactions" },
];

export const reactionLabels = {
  thumbsUp: "👍",
  heart: "❤️",
  clap: "👏",
  wow: "😮",
  fire: "🔥",
};

export function ensureEngagement(slide) {
  slide.engagement ||= {};
  slide.engagement.enabled ??= false;
  slide.engagement.type ||= "poll";
  slide.engagement.prompt ||= "What should we prioritize next?";
  slide.engagement.options ||= ["Option A", "Option B", "Option C"];
  slide.engagement.options = slide.engagement.options.slice(0, MAX_ENGAGEMENT_OPTIONS);
  slide.engagement.correctAnswers ||= [];
  slide.engagement.showCorrectAnswer ??= true;
  slide.engagement.correctAnswerRevealed ??= false;
  slide.engagement.responseLimit = Math.max(1, Number(slide.engagement.responseLimit) || 1);
  slide.engagement.results ||= {};
  slide.engagement.qna ||= [];
  slide.engagement.reactions ||= {
    thumbsUp: 0,
    heart: 0,
    clap: 0,
    wow: 0,
    fire: 0,
  };
  return slide.engagement;
}

export function getAnswerFeedback(slide, response) {
  const engagement = ensureEngagement(slide);
  if (!["multipleChoice", "quiz"].includes(engagement.type) || !response) {
    return null;
  }

  const correctAnswers = normalizedCorrectAnswers(engagement);
  return {
    correctAnswers,
    isCorrect: correctAnswers.includes(response),
    shouldReveal: engagement.correctAnswerRevealed,
  };
}

export function recordAudienceResponse(slide, payload) {
  const engagement = ensureEngagement(slide);
  if (!engagement.enabled) {
    return;
  }

  if (["poll", "multipleChoice", "quiz"].includes(engagement.type)) {
    engagement.results[payload.value] = (engagement.results[payload.value] || 0) + 1;
  }

  if (engagement.type === "wordCloud") {
    const phrase = String(payload.value || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (phrase) engagement.results[phrase] = (engagement.results[phrase] || 0) + 1;
  }

  if (engagement.type === "qna" && payload.value) {
    engagement.qna.push({
      id: crypto.randomUUID?.() || String(Date.now()),
      text: payload.value,
      upvotes: 0,
      answered: false,
    });
  }

  if (engagement.type === "reactions" && payload.value) {
    engagement.reactions[payload.value] = (engagement.reactions[payload.value] || 0) + 1;
  }
}

export function renderLiveControls(container, deck, slide, onChange) {
  const engagement = ensureEngagement(slide);
  container.innerHTML = "";

  const meta = document.createElement("div");
  meta.className = "result-row";
  meta.innerHTML = `
    <strong>${engagement.enabled ? labelForType(engagement.type) : "Presentation-only slide"}</strong>
    <span>Audience code ${escapeHtml(deck.settings.audienceCode)} · ${engagement.enabled ? "Live controls ready" : "No audience input"}</span>
  `;
  container.append(meta);

  if (!engagement.enabled) {
    return;
  }

  const prompt = document.createElement("div");
  prompt.className = "result-row";
  prompt.innerHTML = `<strong>${escapeHtml(engagement.prompt)}</strong>`;
  container.append(prompt);

  if (["poll", "multipleChoice", "quiz"].includes(engagement.type)) {
    renderCorrectAnswerControls(container, engagement, onChange);
    renderResults(container, engagement);
  } else if (engagement.type === "wordCloud") {
    renderWordCloud(container, engagement);
  } else if (engagement.type === "qna") {
    renderQna(container, engagement, onChange);
  } else if (engagement.type === "reactions") {
    renderReactions(container, engagement);
  }
}

export function renderAudienceContent(container, deck, slide, onSubmit, latestResponse = null) {
  const engagement = ensureEngagement(slide);
  const latestResponses = Array.isArray(latestResponse)
    ? latestResponse
    : latestResponse
      ? [latestResponse]
      : [];
  container.innerHTML = "";
  if (!engagement.enabled) {
    return;
  }
  const join = document.createElement("div");
  join.className = "result-row";
  join.innerHTML = `<strong>${escapeHtml(engagement.prompt)}</strong>`;
  container.append(join);

  if (["poll", "multipleChoice", "quiz"].includes(engagement.type)) {
    const responseLimit = engagement.type === "poll"
      ? Math.min(engagement.options.length, Math.max(1, Number(engagement.responseLimit) || 1))
      : 1;
    const options = document.createElement("div");
    options.className = "audience-options";
    for (const option of engagement.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      if (latestResponses.includes(option)) {
        button.setAttribute("aria-pressed", "true");
      }
      button.disabled = latestResponses.includes(option) || latestResponses.length >= responseLimit;
      button.addEventListener("click", () => onSubmit({ value: option }));
      options.append(button);
    }
    container.append(options);
  }

  if (engagement.type === "wordCloud") {
    const form = document.createElement("form");
    form.className = "audience-options";
    form.innerHTML = `
      <label for="audienceInput">Word or phrase</label>
      <input id="audienceInput" type="text" required />
      <button type="submit">Send response</button>
    `;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("input");
      onSubmit({ value: input.value.trim() });
      input.value = "";
    });
    container.append(form);
  }

  if (engagement.type === "reactions") {
    const row = document.createElement("div");
    row.className = "reaction-row";
    for (const [key, label] of Object.entries(reactionLabels)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => onSubmit({ value: key }));
      row.append(button);
    }
    container.append(row);
  }

  if (latestResponses.length) {
    const results = document.createElement("section");
    results.className = "audience-results";
    const heading = document.createElement("strong");
    heading.textContent = engagement.type === "wordCloud" ? "Everyone's responses" : "Live results";
    results.append(heading);
    if (["poll", "multipleChoice", "quiz"].includes(engagement.type)) {
      renderResults(results, engagement);
    } else if (engagement.type === "wordCloud") {
      renderWordCloud(results, engagement);
    } else if (engagement.type === "qna") {
      return;
    } else if (engagement.type === "reactions") {
      renderReactions(results, engagement);
    }
    container.append(results);
  }
}

function renderResults(container, engagement) {
  const totals = Object.values(engagement.results).reduce((sum, value) => sum + value, 0) || 1;
  const correctAnswers = engagement.correctAnswerRevealed ? normalizedCorrectAnswers(engagement) : [];
  for (const option of engagement.options) {
    const count = engagement.results[option] || 0;
    const marker = correctAnswers.includes(option) ? " · Correct" : "";
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <span>${escapeHtml(option)} · ${count}${marker}</span>
      <div class="result-bar"><i style="width:${Math.round((count / totals) * 100)}%"></i></div>
    `;
    container.append(row);
  }
}

function renderCorrectAnswerControls(container, engagement, onChange) {
  if (!["multipleChoice", "quiz"].includes(engagement.type)) {
    return;
  }

  const correctAnswers = normalizedCorrectAnswers(engagement);
  const row = document.createElement("div");
  row.className = "result-row correct-answer-control";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = engagement.correctAnswerRevealed ? "Hide correct answers" : "Display correct answers";
  button.disabled = !correctAnswers.length && !engagement.correctAnswerRevealed;
  button.addEventListener("click", () => {
    engagement.correctAnswerRevealed = !engagement.correctAnswerRevealed;
    onChange();
  });

  const status = document.createElement("span");
  status.textContent = correctAnswers.length
    ? engagement.correctAnswerRevealed
      ? `Showing: ${correctAnswers.join(", ")}`
      : `${correctAnswers.length} answer${correctAnswers.length > 1 ? "s" : ""} ready to reveal`
    : "Mark one or more correct answers in the editor first";

  row.append(button, status);
  container.append(row);

  if (engagement.correctAnswerRevealed) {
    renderCorrectAnswerSummary(container, engagement);
  }
}

function renderCorrectAnswerSummary(container, engagement) {
  if (!["multipleChoice", "quiz"].includes(engagement.type)) {
    return;
  }

  const correctAnswers = normalizedCorrectAnswers(engagement);
  const row = document.createElement("div");
  row.className = "result-row correct-answer-summary";
  row.innerHTML = correctAnswers.length
    ? `<strong>Correct answer${correctAnswers.length > 1 ? "s" : ""}</strong><span>${correctAnswers.map(escapeHtml).join(", ")}</span>`
    : "<strong>Correct answers</strong><span>No correct answer marked yet</span>";
  container.append(row);
}

function renderWordCloud(container, engagement) {
  const words = Object.entries(engagement.results).sort((a, b) => b[1] - a[1]).slice(0, 16);
  const row = document.createElement("div");
  row.className = "result-row word-cloud";
  row.innerHTML = words.length
    ? words.map(([word, count]) => `<span style="font-size:${Math.min(42, 15 + count * 4)}px">${escapeHtml(word)}</span>`).join(" ")
    : "<span>No words yet</span>";
  container.append(row);
}

function renderQna(container, engagement, onChange) {
  if (!engagement.qna.length) {
    const empty = document.createElement("span");
    empty.textContent = "No questions yet";
    container.append(empty);
    return;
  }
  for (const question of engagement.qna) {
    const row = document.createElement("div");
    row.className = `result-row qna-moderation-row${question.visible ? " visible" : " pending"}`;
    row.innerHTML = `<div><strong>${escapeHtml(question.text)}</strong><span>${question.visible ? "Displayed" : "Pending review"} · ${question.upvotes || 0} upvote${question.upvotes === 1 ? "" : "s"}</span></div><div class="qna-actions"><button type="button" data-action="${question.visible ? "hide" : "show"}">${question.visible ? "Hide" : "Display"}</button><button type="button" data-action="${question.answered ? "unanswered" : "answered"}">${question.answered ? "Mark unread" : "Mark answered"}</button><button class="danger" type="button" data-action="delete">Delete</button></div>`;
    row.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => onChange(question, button.dataset.action)));
    container.append(row);
  }
}

function renderAudienceQna(container, engagement, onSubmit) {
  const questions = (engagement.qna || []).filter((question) => question.visible !== false);
  if (!questions.length) {
    const empty = document.createElement("span");
    empty.textContent = "No questions have been displayed yet.";
    container.append(empty);
    return;
  }
  for (const question of [...questions].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))) {
    const row = document.createElement("div");
    row.className = `result-row audience-question${question.answered ? " answered" : ""}`;
    row.innerHTML = `<strong>${escapeHtml(question.text)}</strong><button type="button">▲ ${question.upvotes || 0}</button>`;
    row.querySelector("button").addEventListener("click", () => onSubmit({ action: "upvote", questionId: question.id }));
    container.append(row);
  }
}

function renderReactions(container, engagement) {
  const row = document.createElement("div");
  row.className = "reaction-row";
  for (const [key, label] of Object.entries(reactionLabels)) {
    const cell = document.createElement("div");
    cell.className = "result-row";
    cell.innerHTML = `<strong>${label}</strong><span>${engagement.reactions[key] || 0}</span>`;
    row.append(cell);
  }
  container.append(row);
}

function labelForType(type) {
  return engagementTypes.find((item) => item.value === type)?.label || type;
}

function normalizedCorrectAnswers(engagement) {
  const options = new Set(engagement.options || []);
  return (engagement.correctAnswers || []).filter((answer) => options.has(answer));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
