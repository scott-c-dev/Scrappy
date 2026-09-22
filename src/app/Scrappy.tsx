"use client";

import { css } from "@/lib/css";
import { useScrappy } from "./hooks/useScrappy";
import { InputScreen } from "./components/InputScreen";
import { ConfirmScreen } from "./components/ConfirmScreen";
import { DishesScreen } from "./components/DishesScreen";
import { CookScreen } from "./components/CookScreen";
import { VoiceSheet } from "./components/VoiceSheet";
import { PrefSheet } from "./components/PrefSheet";
import { FinishSheet } from "./components/FinishSheet";
import { ErrorToast } from "./components/ErrorToast";

export default function Scrappy() {
  const {
    state: s,
    startVoice,
    voiceDone,
    voiceCancel,
    voiceRetry,
    voiceType,
    onPhoto,
    typedInput,
    removeIng,
    cycleFreshness,
    openPref,
    pickPref,
    closePref,
    generate,
    startSwapVoice,
    startCook,
    setCookDish,
    nextStep,
    prevStep,
    back,
    restart,
    setState,
  } = useScrappy();

  const goingBad = s.ingredients
    .filter((i) => i.tag === "going bad")
    .map((i) => i.name);
  const rescueCount = s.ingredients.filter((i) => i.tag !== null).length;
  const finishText = goingBad.length
    ? "You used up your " +
      goingBad.join(", ").toLowerCase() +
      (rescueCount > goingBad.length ? " (and more)" : "") +
      " before they turned."
    : "Good cooking.";

  const progressStep = { input: 0, confirm: 1, dishes: 2, cook: 3 }[s.screen];
  const showBack = s.screen !== "input";

  return (
    <div
      className="scrappy-root"
      style={css(
        "height:100dvh;background:var(--page);font-family:var(--font-body);color:var(--ink);display:flex;flex-direction:column;overflow:hidden",
      )}
    >
      {/* Full-bleed card — fixed shell, only the inner area scrolls */}
      <div
        style={css(
          "width:100%;flex:1;min-height:0;background:var(--paper);position:relative;overflow:hidden;display:flex;flex-direction:column",
        )}
      >
        {/* Header */}
        <div
          style={css(
            "display:flex;align-items:center;justify-content:space-between;padding:16px 18px 10px;flex:none",
          )}
        >
          <div style={css("display:flex;align-items:center;gap:10px;min-width:0")}>
            {showBack && (
              <button
                onClick={back}
                aria-label="Back"
                style={css(
                  "cursor:pointer;border:1px solid var(--line);background:var(--card);width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--ink);font-size:18px;flex:none;padding-bottom:2px",
                )}
              >
                ‹
              </button>
            )}
            <span
              style={css(
                "font-family:var(--font-display);font-weight:800;font-size:20px;color:var(--ink)",
              )}
            >
              Scrappy
            </span>
          </div>
          <div style={css("display:flex;gap:5px;align-items:center")}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={css(
                  "width:7px;height:7px;border-radius:50%;background:" +
                    (i <= progressStep ? "var(--accent)" : "var(--line)"),
                )}
              />
            ))}
          </div>
        </div>

        {/* Scroll area */}
        <div
          className="noscroll"
          style={css(
            "flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;position:relative",
          )}
        >
          {s.screen === "input" && (
            <InputScreen
              onVoice={() => startVoice("input")}
              onPhoto={onPhoto}
              onType={typedInput}
            />
          )}
          {s.screen === "confirm" && (
            <ConfirmScreen
              ingredients={s.ingredients}
              prefs={s.prefs}
              onAddVoice={() => startVoice("add")}
              onRemove={removeIng}
              onCycleFreshness={cycleFreshness}
              onOpenPref={openPref}
              onGenerate={generate}
            />
          )}
          {s.screen === "dishes" && (
            <DishesScreen
              loading={s.dishesLoading}
              dishes={s.dishes}
              replacingId={s.replacingId}
              goingBad={goingBad}
              rescueCount={rescueCount}
              onSwap={startSwapVoice}
              onStartCook={startCook}
            />
          )}
          {s.screen === "cook" && (
            <CookScreen
              dishes={s.dishes}
              cookDish={s.cookDish}
              cookStep={s.cookStep}
              imgState={s.imgState}
              imgUrls={s.imgUrls}
              onSetDish={setCookDish}
              onNext={nextStep}
              onPrev={prevStep}
            />
          )}
        </div>

        {/* Sheets (rendered inside the card so position:absolute covers it) */}
        {s.voiceOpen && (
          <VoiceSheet
            voiceState={s.voiceState}
            voiceTitle={s.voiceTitle}
            onDone={voiceDone}
            onCancel={voiceCancel}
            onRetry={voiceRetry}
            onType={voiceType}
          />
        )}
        {s.prefOpen && s.prefKey && (
          <PrefSheet
            prefKey={s.prefKey}
            prefs={s.prefs}
            onPick={pickPref}
            onClose={closePref}
            onVoice={startVoice}
          />
        )}
        {s.finishOpen && (
          <FinishSheet
            finaleUrl={s.finaleUrl}
            finaleLoading={s.finaleLoading}
            finishText={finishText}
            onBack={() => setState({ finishOpen: false })}
            onRestart={restart}
          />
        )}
        {s.error && (
          <ErrorToast
            error={s.error}
            onDismiss={() => setState({ error: null })}
          />
        )}
      </div>
    </div>
  );
}
