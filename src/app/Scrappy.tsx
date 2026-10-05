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
import { ErrorToast } from "./components/ErrorToast";
import { SwapSheet } from "./components/SwapSheet";
import { AdjustSheet } from "./components/AdjustSheet";
import { SettingsScreen } from "./components/SettingsScreen";
import { onTheClock } from "./components/freshness";
import { voiceErrorView } from "./voiceErrors";

export default function Scrappy() {
  const {
    state: s,
    startVoice,
    voiceDone,
    voiceCancel,
    voiceErrorAction,
    reviewChange,
    reviewEdit,
    reviewSend,
    typedInput,
    removeIng,
    openAdjust,
    closeAdjust,
    updateIng,
    openPref,
    pickPref,
    closePref,
    generate,
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
    back,
    restart,
    setState,
  } = useScrappy();

  const goingBad = s.ingredients
    .filter((i) => i.tag === "going bad")
    .map((i) => i.name);
  const rescueCount = s.ingredients.filter((i) => onTheClock(i.tag)).length;
  const finishText = goingBad.length
    ? "You used up your " +
      goingBad.join(", ").toLowerCase() +
      (rescueCount > goingBad.length ? " (and more)" : "") +
      " before they turned."
    : "Good cooking.";

  const progressStep = { input: 0, settings: 0, confirm: 1, dishes: 2, cook: 3 }[s.screen];
  const showBack = s.screen !== "input";
  const voiceError =
    s.voiceError && s.voiceContext
      ? voiceErrorView(s.voiceError, s.voiceContext, s.errorKeptText, s.backOnline)
      : null;
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
              {s.screen === "settings" ? "Settings" : "Scrappy"}
            </span>
          </div>
          <div className="flex items-center gap-12">
            <div
              className={cx(
                "flex items-center gap-5",
                s.screen === "settings" && "opacity-0",
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
              onVoice={() => startVoice("input")}
              onType={typedInput}
            />
          )}
          {s.screen === "settings" && (
            <SettingsScreen units={s.units} onUnits={setUnits} />
          )}
          {s.screen === "confirm" && (
            <ConfirmScreen
              ingredients={s.ingredients}
              prefs={s.prefs}
              onAddVoice={() => startVoice("add")}
              onRemove={removeIng}
              onAdjust={openAdjust}
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
              onSwap={openSwap}
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
            dishName={swapSheetDish.name}
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
