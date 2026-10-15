"use client";

import { cx } from "@/lib/cx";
import { useScrappy } from "./hooks/useScrappy";
import { InputScreen } from "./components/InputScreen";
import { ConfirmScreen } from "./components/ConfirmScreen";
import { DishesScreen } from "./components/DishesScreen";
import { CookScreen } from "./components/CookScreen";
import { VoiceSheet } from "./components/VoiceSheet";
import { PrefSheet } from "./components/PrefSheet";
import { FinishSheet } from "./components/FinishSheet";
import { SwapSheet } from "./components/SwapSheet";
import { AdjustSheet } from "./components/AdjustSheet";
import { SettingsScreen } from "./components/SettingsScreen";
import { AiKeyCard, AiSetupScreen } from "./components/AiService";
import { finishLine, swapLine } from "./components/dishCopy";
import { aiNames, errorView, headsUpText, needsSettings, swapErrorLine } from "./errors";

export default function Scrappy() {
  const {
    state: s,
    ai,
    startVoice,
    voiceDone,
    voiceCancel,
    voiceErrorAction,
    reviewChange,
    reviewEdit,
    reviewSend,
    removeIng,
    openAdjust,
    closeAdjust,
    updateIng,
    openPref,
    pickPref,
    closePref,
    generate,
    genErrorAction,
    swapErrorAction,
    typeIn,
    retryPic,
    openSwap,
    closeSwap,
    swapNow,
    swapByVoice,
    swapByText,
    startCook,
    setCookDish,
    nextStep,
    prevStep,
    openSettings,
    setUnits,
    setStepPics,
    homeVoice,
    homeType,
    saveAi,
    removeAi,
    closeKeySheet,
    openAiSetup,
    closeAiSetup,
    back,
    restart,
    setState,
  } = useScrappy();

  const finish = finishLine(s.dishes, s.ingredients);

  const progressStep = { input: 0, settings: 0, aiSetup: 0, confirm: 1, dishes: 2, cook: 3 }[s.screen];
  const inSettings = s.screen === "settings" || s.screen === "aiSetup";
  const keyState = ai === undefined
    ? "loading"
    : !ai
      ? "none"
      : s.justConnected
        ? "connected"
        : "ready";
  const showBack = s.screen !== "input";
  const names = aiNames(ai);
  const voiceError =
    s.voiceError && s.voiceContext
      ? errorView(
          s.voiceError,
          s.voiceContext,
          { keptText: s.errorKeptText, backOnline: s.backOnline, courses: s.prefs.courses },
          names,
        )
      : null;
  const genError = s.genError
    ? errorView(s.genError, "gen", { keptText: true, backOnline: s.backOnline, courses: s.prefs.courses }, names)
    : null;
  const swapError = s.swapError && {
    id: s.swapError.id,
    line: swapErrorLine(s.swapError.kind, names),
    button: needsSettings(s.swapError.kind, names) ? "AI settings" : "Try again",
  };
  const swapSheetDish = s.dishes.find((d) => d.id === s.swapSheetId);
  const adjusting = s.ingredients.find((i) => i.id === s.adjustId);

  return (
    <div className="scrappy-root flex h-dvh flex-col overflow-hidden bg-page font-body text-ink">
      {/* Full-bleed card — fixed shell, only the inner area scrolls */}
      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-paper">
        {/* Header */}
        <div className="flex flex-none items-center justify-between px-18 pt-16 pb-10">
          <div className="flex min-w-0 items-center gap-10">
            {showBack && (
              <HeaderButton onClick={back} aria-label="Back" className="pb-2 text-20 text-ink">
                ‹
              </HeaderButton>
            )}
            <span className="font-display text-20 font-extrabold text-ink">
              {s.screen === "settings" ? "Settings" : s.screen === "aiSetup" ? "AI service" : "Scrappy"}
            </span>
          </div>
          <div className="flex items-center gap-12">
            <div
              className={cx(
                "flex items-center gap-5",
                inSettings && "opacity-0",
              )}
            >
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cx(
                    "size-7 rounded-full",
                    i <= progressStep ? "bg-accent" : "bg-line",
                  )}
                />
              ))}
            </div>
            {/* Settings only from home: units shouldn't change mid-flow. */}
            {s.screen === "input" && (
              <HeaderButton onClick={openSettings} aria-label="Settings" className="text-ink-soft">
                <GearIcon />
              </HeaderButton>
            )}
          </div>
        </div>

        {/* Scroll area */}
        <div className="noscroll relative flex-1 overflow-y-auto">
          {s.screen === "input" && (
            <InputScreen
              keyState={keyState}
              onVoice={homeVoice}
              onType={homeType}
              onSetup={homeVoice}
            />
          )}
          {s.screen === "settings" && (
            <SettingsScreen
              ai={ai ?? null}
              onAiService={() => openAiSetup("settings")}
              headsUp={s.lastFail && headsUpText(s.lastFail, names)}
              units={s.units}
              onUnits={setUnits}
              images={s.caps.images}
              stepPics={s.stepPics}
              onStepPics={setStepPics}
            />
          )}
          {s.screen === "aiSetup" && (
            <AiSetupScreen
              saved={ai ?? null}
              onSave={saveAi}
              onRemove={removeAi}
              onDone={closeAiSetup}
              fix={s.setupFix?.reason}
              focusModel={s.setupFix?.model}
            />
          )}
          {s.screen === "confirm" && (
            <ConfirmScreen
              ingredients={s.ingredients}
              prefs={s.prefs}
              onAddVoice={() => startVoice("add")}
              onAddType={() => typeIn("add")}
              onRemove={removeIng}
              onAdjust={openAdjust}
              onOpenPref={openPref}
              onGenerate={generate}
            />
          )}
          {s.screen === "dishes" && (
            <DishesScreen
              loading={s.dishesLoading}
              slow={s.genSlow}
              error={genError}
              dishes={s.dishes}
              replacingId={s.replacingId}
              swapSlow={s.swapSlow}
              swapError={swapError}
              ingredients={s.ingredients}
              onSwap={openSwap}
              onSwapError={swapErrorAction}
              onErrorAction={genErrorAction}
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
              pictures={s.stepPics && s.caps.images}
              onSetDish={setCookDish}
              onNext={nextStep}
              onPrev={prevStep}
              onRetryPic={retryPic}
            />
          )}
        </div>

        {/* Sheets (rendered inside the card so position:absolute covers it) */}
        {s.voiceOpen && (
          <VoiceSheet
            voiceState={s.voiceState}
            voiceContext={s.voiceContext}
            voiceTitle={s.voiceTitle}
            voicePartial={s.voicePartial}
            processingLabel={s.processingLabel}
            reviewText={s.reviewText}
            reviewEditing={s.reviewEditing}
            reviewTyped={s.reviewTyped}
            error={voiceError}
            onDone={voiceDone}
            onCancel={voiceCancel}
            onReviewChange={reviewChange}
            onReviewEdit={reviewEdit}
            onReviewRedo={() => s.voiceContext && startVoice(s.voiceContext)}
            onReviewSend={reviewSend}
            onErrorAction={voiceErrorAction}
          />
        )}
        {adjusting && (
          <AdjustSheet
            key={adjusting.id}
            ingredient={adjusting}
            units={s.units}
            onChange={(patch) => updateIng(adjusting.id, patch)}
            onClose={closeAdjust}
          />
        )}
        {swapSheetDish && (
          <SwapSheet
            line={swapLine(swapSheetDish, s.ingredients)}
            onSwap={swapNow}
            onVoice={swapByVoice}
            onType={swapByText}
            onClose={closeSwap}
          />
        )}
        {s.prefOpen && s.prefKey && (
          <PrefSheet
            prefKey={s.prefKey}
            prefs={s.prefs}
            custom={s.customPrefs[s.prefKey]}
            onPick={pickPref}
            onClose={closePref}
            onVoice={startVoice}
            onType={typeIn}
          />
        )}
        {s.keySheetOpen && (
          <AiKeyCard onAdd={() => openAiSetup("input")} onClose={closeKeySheet} />
        )}
        {s.finishOpen && (
          <FinishSheet
            finaleUrl={s.finaleUrl}
            finaleLoading={s.finaleLoading}
            finishText={finish.text}
            urgent={finish.urgent}
            onBack={() => setState({ finishOpen: false })}
            onRestart={restart}
          />
        )}
      </div>
    </div>
  );
}

function HeaderButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "flex size-34 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-card",
        className,
      )}
    />
  );
}

function GearIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
