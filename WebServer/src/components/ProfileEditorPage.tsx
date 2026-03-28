"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useFlowConnection } from "~/components/FlowConnectionProvider";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import { useProfiles } from "~/hooks/useProfiles";
import { useToast } from "~/components/ui/use-toast";
import type {
  PhaseProfile,
  Phase,
  PhaseStopConditions,
  GlobalStopConditions,
  TransitionCurve,
  PhaseStopConditionType,
  PhaseStopConditionEntry,
  GlobalStopConditionType,
  GlobalStopConditionEntry,
} from "~/types/profiles";
import { calculatePhaseProfileDuration, importGaggiuinoProfile, validatePhaseProfile } from "~/lib/profileUtils";
import { PROFILE_PRESSURE_COLOR, PROFILE_FLOW_COLOR } from "~/lib/profileColors";
import { cn } from "~/lib/utils";

const CURVES: { value: TransitionCurve; label: string }[] = [
  { value: "INSTANT", label: "Instant" },
  { value: "LINEAR", label: "Linear" },
  { value: "EASE_IN", label: "Ease In" },
  { value: "EASE_OUT", label: "Ease Out" },
  { value: "EASE_IN_OUT", label: "Ease In Out" },
];

const PHASE_STOP_CONDITION_OPTIONS: { type: PhaseStopConditionType; label: string; unit: string; min: number; max: number; step: number }[] = [
  { type: "time", label: "Time", unit: "s", min: 0, max: 120, step: 0.5 },
  { type: "weight", label: "Weight", unit: "g", min: 0, max: 200, step: 1 },
  { type: "pressureAbove", label: "Pressure above", unit: "bar", min: 0, max: 15, step: 0.5 },
  { type: "pressureBelow", label: "Pressure below", unit: "bar", min: 0, max: 15, step: 0.5 },
  { type: "flowAbove", label: "Flow above", unit: "ml/s", min: 0, max: 20, step: 0.5 },
  { type: "flowBelow", label: "Flow below", unit: "ml/s", min: 0, max: 20, step: 0.5 },
  { type: "waterPumpedInPhase", label: "Water pumped in phase", unit: "ml", min: 0, max: 500, step: 1 },
];

const GLOBAL_STOP_OPTIONS: { type: GlobalStopConditionType; label: string; unit: string; min: number; max: number; step: number }[] = [
  { type: "time", label: "Time", unit: "s", min: 0, max: 300, step: 1 },
  { type: "weight", label: "Weight", unit: "g", min: 0, max: 200, step: 1 },
  { type: "waterPumped", label: "Water pumped", unit: "ml", min: 0, max: 500, step: 1 },
];

function phaseStopConditionsToEntries(sc: PhaseStopConditions): PhaseStopConditionEntry[] {
  const entries: PhaseStopConditionEntry[] = [];
  for (const opt of PHASE_STOP_CONDITION_OPTIONS) {
    const v = sc[opt.type];
    if (v != null && v > 0) entries.push({ type: opt.type, value: v });
  }
  return entries;
}

function phaseStopConditionsFromEntries(entries: PhaseStopConditionEntry[]): PhaseStopConditions {
  const sc: PhaseStopConditions = {};
  for (const e of entries) {
    if (e.value > 0) (sc as Record<string, number>)[e.type] = e.value;
  }
  return sc;
}

function globalStopConditionsToEntries(g: GlobalStopConditions): GlobalStopConditionEntry[] {
  const entries: GlobalStopConditionEntry[] = [];
  for (const opt of GLOBAL_STOP_OPTIONS) {
    const v = g[opt.type];
    if (v != null && v > 0) entries.push({ type: opt.type, value: v });
  }
  return entries;
}

function globalStopConditionsFromEntries(entries: GlobalStopConditionEntry[]): GlobalStopConditions {
  const g: GlobalStopConditions = {};
  for (const e of entries) {
    if (e.value > 0) (g as Record<string, number>)[e.type] = e.value;
  }
  return g;
}

const defaultPhase: Phase = {
  type: "PRESSURE",
  target: { end: 3, curve: "INSTANT", time: 5 },
  restriction: 6,
  stopConditions: { time: 10 },
};

interface NumberInputProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  className?: string;
  onChange: (value: number) => void;
}

// Live-updating number input: commits on every change so the graph reacts immediately.
function NumberInput({
  label,
  value,
  min = 0,
  max = 1000,
  step = 0.5,
  unit = "",
  className,
  onChange,
}: NumberInputProps) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setRaw(next);

    const n = parseFloat(next);
    if (!Number.isNaN(n)) {
      const clamped = Math.max(min, Math.min(max, n));
      onChange(clamped);
    }
  };

  return (
    <div className={className ? `space-y-1 ${className}` : "space-y-1"}>
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={raw}
          onChange={handleChange}
          className="w-24 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

/** Input for stop condition value: commits only on blur when valid; reverts to previous value if empty/invalid. */
interface StopConditionValueInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

function StopConditionValueInput({ value, min, max, step, unit, onChange }: StopConditionValueInputProps) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);

  const handleBlur = () => {
    const n = parseFloat(raw);
    if (!Number.isNaN(n) && n > 0) {
      const clamped = Math.max(min, Math.min(max, n));
      onChange(clamped);
      setRaw(String(clamped));
    } else {
      setRaw(String(value));
    }
  };

  return (
    <>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={handleBlur}
        className="w-20 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </>
  );
}

interface PhaseStepEditorProps {
  phase: Phase;
  index: number;
  onChange: (phase: Phase) => void;
  onRemove: () => void;
  onSaveStep: () => void;
  canRemove: boolean;
}

interface StepSummaryCardProps {
  phase: Phase;
  index: number;
  selected: boolean;
  onClick: () => void;
  innerRef?: (el: HTMLButtonElement | null) => void;
}

function StepSummaryCard({ phase, index, selected, onClick, innerRef }: StepSummaryCardProps) {
  const curveLabel = CURVES.find((c) => c.value === phase.target.curve)?.label ?? phase.target.curve;
  const unit = phase.type === "PRESSURE" ? "bar" : "ml/s";
  const entries = phaseStopConditionsToEntries(phase.stopConditions);
  const firstStop = entries[0];
  const stopLabel = firstStop
    ? `${PHASE_STOP_CONDITION_OPTIONS.find((o) => o.type === firstStop.type)?.label ?? firstStop.type}: ${firstStop.value}${PHASE_STOP_CONDITION_OPTIONS.find((o) => o.type === firstStop.type)?.unit ?? ""}`
    : "No stop";

  const isPressure = phase.type === "PRESSURE";
  const color = isPressure ? PROFILE_PRESSURE_COLOR : PROFILE_FLOW_COLOR;
  const borderColor = selected ? "transparent" : `${color}99`;
  const backgroundColor = selected ? `${color}33` : `${color}1a`;

  return (
    <button
      type="button"
      ref={innerRef}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={selected ? `Step ${index + 1}, currently editing` : `Step ${index + 1}, click to edit`}
      className={`flex-shrink-0 snap-center rounded-lg border-2 p-3 text-left transition-all transition-transform duration-150 cursor-pointer w-[160px] min-h-[100px] hover:opacity-90 hover:scale-[1.03] ${
        selected ? "scale-[1.02]" : ""
      }`}
      style={{
        borderColor,
        backgroundColor,
        ...(selected ? { boxShadow: `inset 0 0 0 2px ${color}` } : {}),
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-medium">Step {index + 1}</span>
        {selected && (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: color }}
          >
            Editing
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{phase.type}</div>
      <div className="text-xs">Target: {phase.target.end} {unit}</div>
      <div className="text-xs text-muted-foreground">Curve: {curveLabel}</div>
      <div className="text-xs text-muted-foreground truncate" title={stopLabel}>Stop: {stopLabel}</div>
    </button>
  );
}

interface AddStepCardProps {
  onClick: () => void;
  disabled: boolean;
}

function AddStepCard({ onClick, disabled }: AddStepCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-shrink-0 snap-center items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/40 w-[160px] min-h-[100px] hover:border-muted-foreground/70 hover:bg-muted/50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
    >
      <div className="flex flex-col items-center gap-1">
        <Plus className="h-8 w-8 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Add step</span>
      </div>
    </button>
  );
}

interface PhaseStopConditionsEditorProps {
  stopConditions: PhaseStopConditions;
  onChange: (sc: PhaseStopConditions) => void;
}

function PhaseStopConditionsEditor({ stopConditions, onChange }: PhaseStopConditionsEditorProps) {
  const entries = phaseStopConditionsToEntries(stopConditions);
  const usedTypes = new Set(entries.map((e) => e.type));
  const availableOptions = PHASE_STOP_CONDITION_OPTIONS.filter((o) => !usedTypes.has(o.type));

  const addEntry = (type: PhaseStopConditionType, value: number) => {
    const opt = PHASE_STOP_CONDITION_OPTIONS.find((o) => o.type === type)!;
    const clamped = Math.max(opt.min, Math.min(opt.max, value));
    if (clamped <= 0) return;
    onChange(phaseStopConditionsFromEntries([...entries, { type, value: clamped }]));
  };

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(phaseStopConditionsFromEntries(next));
  };

  const updateEntry = (index: number, value: number) => {
    const e = entries[index]!;
    const opt = PHASE_STOP_CONDITION_OPTIONS.find((o) => o.type === e.type)!;
    const clamped = Math.max(opt.min, Math.min(opt.max, value));
    const next = entries.map((e2, i) => (i === index ? { ...e2, value: clamped } : e2));
    onChange(phaseStopConditionsFromEntries(next));
  };

  return (
    <div className="space-y-2 border-t pt-2">
      <span className="text-sm font-medium">Stop conditions (phase)</span>
      <ul className="space-y-1.5">
        {entries.map((e, i) => {
          const opt = PHASE_STOP_CONDITION_OPTIONS.find((o) => o.type === e.type)!;
          return (
            <li key={`${e.type}-${i}`} className="flex items-center gap-2">
              <span className="min-w-[140px] text-sm">{opt.label}:</span>
              <StopConditionValueInput
                value={e.value}
                min={opt.min}
                max={opt.max}
                step={opt.step}
                unit={opt.unit}
                onChange={(v) => updateEntry(i, v)}
              />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeEntry(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
      {availableOptions.length > 0 && (
        <AddStopConditionRow
          options={PHASE_STOP_CONDITION_OPTIONS}
          availableOptions={availableOptions}
          onAdd={addEntry}
        />
      )}
    </div>
  );
}

interface GlobalStopConditionsEditorProps {
  globalStop: GlobalStopConditions;
  onChange: (g: GlobalStopConditions) => void;
}

function GlobalStopConditionsEditor({ globalStop, onChange }: GlobalStopConditionsEditorProps) {
  const entries = globalStopConditionsToEntries(globalStop);
  const usedTypes = new Set(entries.map((e) => e.type));
  const availableOptions = GLOBAL_STOP_OPTIONS.filter((o) => !usedTypes.has(o.type));

  const addEntry = (type: GlobalStopConditionType, value: number) => {
    const opt = GLOBAL_STOP_OPTIONS.find((o) => o.type === type)!;
    const clamped = Math.max(opt.min, Math.min(opt.max, value));
    if (clamped <= 0) return;
    onChange(globalStopConditionsFromEntries([...entries, { type, value: clamped }]));
  };

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(globalStopConditionsFromEntries(next));
  };

  const updateEntry = (index: number, value: number) => {
    const e = entries[index]!;
    const opt = GLOBAL_STOP_OPTIONS.find((o) => o.type === e.type)!;
    const clamped = Math.max(opt.min, Math.min(opt.max, value));
    const next = entries.map((e2, i) => (i === index ? { ...e2, value: clamped } : e2));
    onChange(globalStopConditionsFromEntries(next));
  };

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Stop conditions</span>
      <ul className="space-y-1.5">
        {entries.map((e, i) => {
          const opt = GLOBAL_STOP_OPTIONS.find((o) => o.type === e.type)!;
          return (
            <li key={`${e.type}-${i}`} className="flex items-center gap-2">
              <span className="min-w-[120px] text-sm">{opt.label}:</span>
              <StopConditionValueInput
                value={e.value}
                min={opt.min}
                max={opt.max}
                step={opt.step}
                unit={opt.unit}
                onChange={(v) => updateEntry(i, v)}
              />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeEntry(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
      {availableOptions.length > 0 && (
        <AddStopConditionRow
          options={GLOBAL_STOP_OPTIONS}
          availableOptions={availableOptions}
          onAdd={addEntry}
        />
      )}
    </div>
  );
}

interface AddStopConditionRowProps<T extends PhaseStopConditionType | GlobalStopConditionType> {
  options: readonly { type: T; label: string; unit: string; min: number; max: number; step: number }[];
  availableOptions: readonly { type: T; label: string; unit: string; min: number; max: number; step: number }[];
  onAdd: (type: T, value: number) => void;
}

interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownSelectorProps<T extends string> {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

function DropdownSelector<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Choose option",
  triggerClassName,
  contentClassName,
}: DropdownSelectorProps<T>) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className={cn("justify-between font-normal", triggerClassName)}>
          <span>{selectedOption?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={contentClassName}>
        <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => onChange(nextValue as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddStopConditionRow<T extends PhaseStopConditionType | GlobalStopConditionType>({
  availableOptions,
  onAdd,
}: AddStopConditionRowProps<T>) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedType, setSelectedType] = useState<T | "">(() => availableOptions[0]?.type ?? "");
  const [value, setValue] = useState("");

  const opt = selectedType ? availableOptions.find((o) => o.type === selectedType) ?? availableOptions[0] ?? null : availableOptions[0] ?? null;
  useEffect(() => {
    if (availableOptions.length > 0 && !availableOptions.some((o) => o.type === selectedType)) {
      setSelectedType(availableOptions[0]!.type as T);
    }
  }, [availableOptions, selectedType]);

  const handleStartAdd = () => {
    setIsAdding(true);
    setSelectedType((availableOptions[0]?.type ?? "") as T | "");
    setValue("");
  };

  const handleSave = () => {
    if (!opt || value === "") return;
    const n = parseFloat(value);
    if (!Number.isNaN(n)) {
      onAdd(opt.type, n);
      setValue("");
      setIsAdding(false);
      const next = availableOptions.find((o) => o.type !== opt.type)?.type ?? availableOptions[0]?.type ?? "";
      setSelectedType(next as T | "");
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setValue("");
    setSelectedType((availableOptions[0]?.type ?? "") as T | "");
  };

  if (!isAdding) {
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={handleStartAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <DropdownSelector
        value={opt?.type ?? availableOptions[0]?.type ?? ("" as T)}
        options={availableOptions.map((o) => ({ value: o.type, label: o.label }))}
        onChange={setSelectedType}
        placeholder="Choose condition"
        triggerClassName="min-w-[190px]"
        contentClassName="min-w-[190px]"
      />
      {opt && (
        <>
          <input
            type="number"
            min={opt.min}
            max={opt.max}
            step={opt.step}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={String(opt.min)}
            className="w-20 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
          />
          <span className="text-xs text-muted-foreground">{opt.unit}</span>
        </>
      )}
      <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={!opt || value === ""}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
        Cancel
      </Button>
    </div>
  );
}

function PhaseStepEditor({ phase, index, onChange, onRemove, onSaveStep, canRemove }: PhaseStepEditorProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Step {index + 1}</CardTitle>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="secondary" onClick={onSaveStep}>
            Save step
          </Button>
          {canRemove && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Type</label>
          <div
            role="group"
            aria-label="Phase type"
            className="mt-1.5 inline-flex w-full rounded-lg border border-input bg-muted/50 p-0.5"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "flex-1 rounded-md text-sm font-medium transition-colors",
                phase.type === "PRESSURE"
                  ? "text-white hover:opacity-90"
                  : "text-muted-foreground hover:text-foreground"
              )}
              style={phase.type === "PRESSURE" ? { backgroundColor: PROFILE_PRESSURE_COLOR } : undefined}
              onClick={() => onChange({ ...phase, type: "PRESSURE" })}
            >
              Pressure
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "flex-1 rounded-md text-sm font-medium transition-colors",
                phase.type === "FLOW"
                  ? "text-white hover:opacity-90"
                  : "text-muted-foreground hover:text-foreground"
              )}
              style={phase.type === "FLOW" ? { backgroundColor: PROFILE_FLOW_COLOR } : undefined}
              onClick={() => onChange({ ...phase, type: "FLOW" })}
            >
              Flow
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {phase.target.curve !== "INSTANT" && (
            <NumberInput
              label="Target start"
              value={phase.target.start ?? 0}
              min={0}
              max={phase.type === "PRESSURE" ? 9 : 10}
              step={0.5}
              unit={phase.type === "PRESSURE" ? "bar" : "ml/s"}
              onChange={(v) => onChange({ ...phase, target: { ...phase.target, start: v } })}
            />
          )}
          <NumberInput
            label="Target end"
            value={phase.target.end}
            min={0}
            max={phase.type === "PRESSURE" ? 9 : 10}
            step={0.5}
            unit={phase.type === "PRESSURE" ? "bar" : "ml/s"}
            onChange={(v) => onChange({ ...phase, target: { ...phase.target, end: v } })}
          />
          <NumberInput
            label="Target time"
            value={phase.target.time}
            min={0}
            max={120}
            step={0.5}
            unit="s"
            onChange={(v) => onChange({ ...phase, target: { ...phase.target, time: v } })}
            className={phase.target.curve !== "INSTANT" ? "col-span-2" : undefined}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Curve</label>
          <div className="mt-1">
            <DropdownSelector
              value={phase.target.curve}
              options={CURVES.map((curve) => ({ value: curve.value, label: curve.label }))}
              onChange={(nextCurve) => {
              const nextTarget = { ...phase.target, curve: nextCurve };
              // When switching from INSTANT to a start/end curve and no explicit start is set yet,
              // default start to 0 so the graph uses 0 instead of the previous phase's end.
              if (nextCurve !== "INSTANT" && nextTarget.start == null) {
                nextTarget.start = 0;
              }
              onChange({ ...phase, target: nextTarget });
              }}
              triggerClassName="w-full"
              contentClassName="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]"
            />
          </div>
        </div>

        {/* Restriction = cap on the other axis: pressure phase → flow cap (ml/s); flow phase → pressure cap (bar) */}
        <NumberInput
          label={phase.type === "PRESSURE" ? "Restriction (flow cap)" : "Restriction (pressure cap)"}
          value={phase.restriction}
          min={0}
          max={phase.type === "PRESSURE" ? 10 : 9}
          step={0.5}
          unit={phase.type === "PRESSURE" ? "ml/s" : "bar"}
          onChange={(v) => onChange({ ...phase, restriction: v })}
        />

        <PhaseStopConditionsEditor stopConditions={phase.stopConditions} onChange={(sc) => onChange({ ...phase, stopConditions: sc })} />
      </CardContent>
    </Card>
  );
}

export function ProfileEditorPage({ profileId }: { profileId?: string }) {
  const router = useRouter();
  const { profiles, isLoaded, createProfile, updateProfile, selectProfile } = useProfiles();
  const { toast } = useToast();
  const { isConnected: flowConnected, sendRaw: flowSendRaw } = useFlowConnection();

  const [name, setName] = useState("");
  const [phases, setPhases] = useState<Phase[]>([{ ...defaultPhase }]);
  const [commandedPhases, setCommandedPhases] = useState<Phase[]>([{ ...defaultPhase }]);
  const [globalStop, setGlobalStop] = useState<GlobalStopConditions>({ weight: 40 });
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [deviceSlotIndexToWrite, setDeviceSlotIndexToWrite] = useState<number | null>(null);
  const [advancedOverrideOpen, setAdvancedOverrideOpen] = useState(false);
  const [advancedOverrideJson, setAdvancedOverrideJson] = useState("");
  const [advancedOverrideErrors, setAdvancedOverrideErrors] = useState<string[]>([]);
  const carouselRef = useRef<HTMLDivElement>(null);
  const stepCardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const buildFirmwareProfileJson = useCallback((candidate: PhaseProfile): string => {
    const toMs = (seconds: number | undefined): number | undefined => {
      if (seconds == null) return undefined;
      if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
      return Math.round(seconds * 1000);
    };

    const phasesOut = candidate.phases.map((p) => {
      const targetTimeMs = toMs(p.target?.time);
      const stop = p.stopConditions ?? {};
      const stopOut: Record<string, number> = {};
      // Firmware advances phases based on stopConditions (not target.time alone).
      // Make "Target time" authoritative for time-based phase progression.
      if (targetTimeMs != null) {
        stopOut.time = targetTimeMs;
      } else if (toMs(stop.time) != null) {
        stopOut.time = toMs(stop.time)!;
      }
      if (typeof stop.pressureAbove === "number" && stop.pressureAbove > 0) stopOut.pressureAbove = stop.pressureAbove;
      if (typeof stop.pressureBelow === "number" && stop.pressureBelow > 0) stopOut.pressureBelow = stop.pressureBelow;
      if (typeof stop.flowAbove === "number" && stop.flowAbove > 0) stopOut.flowAbove = stop.flowAbove;
      if (typeof stop.flowBelow === "number" && stop.flowBelow > 0) stopOut.flowBelow = stop.flowBelow;
      if (typeof stop.weight === "number" && stop.weight > 0) stopOut.weight = stop.weight;
      if (typeof stop.waterPumpedInPhase === "number" && stop.waterPumpedInPhase > 0) stopOut.waterPumpedInPhase = stop.waterPumpedInPhase;

      const targetOut: Record<string, number | string> = {
        end: p.target.end,
        curve: p.target.curve,
        time: targetTimeMs ?? 0,
      };
      if (typeof p.target.start === "number") targetOut.start = p.target.start;

      return {
        type: p.type,
        target: targetOut,
        restriction: p.restriction,
        stopConditions: stopOut,
      };
    });

    const g = candidate.globalStopConditions ?? {};
    const globalOut: Record<string, number> = {};
    if (toMs(g.time) != null) globalOut.time = toMs(g.time)!;
    if (typeof g.weight === "number" && g.weight > 0) globalOut.weight = g.weight;
    if (typeof g.waterPumped === "number" && g.waterPumped > 0) globalOut.waterPumped = g.waterPumped;

    return JSON.stringify({
      name: candidate.name,
      phases: phasesOut,
      globalStopConditions: globalOut,
    });
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (profileId) {
      const p = profiles.find((x) => x.id === profileId);
      if (p) {
        const loadedPhases = p.phases.length > 0 ? p.phases.map((ph) => ({ ...ph })) : [{ ...defaultPhase }];
        setName(p.name);
        setPhases(loadedPhases);
        setCommandedPhases(loadedPhases.map((ph) => ({ ...ph })));
        setGlobalStop({ ...p.globalStopConditions });
        setSelectedStepIndex(0);
        setDeviceSlotIndexToWrite(null);
      } else {
        router.push("/");
      }
    } else {
      try {
        const raw = typeof window !== "undefined" && sessionStorage.getItem("elizbeth-profile-edit-initial");
        if (raw) {
          const data = JSON.parse(raw) as { id?: string; name?: string; phases?: Phase[]; globalStopConditions?: GlobalStopConditions };
          if (
            data &&
            typeof data.name === "string" &&
            Array.isArray(data.phases) &&
            data.phases.length > 0 &&
            data.globalStopConditions &&
            typeof data.globalStopConditions === "object"
          ) {
            const match = typeof data.id === "string" ? /^device-slot-(\d+)$/.exec(data.id) : null;
            setDeviceSlotIndexToWrite(match ? parseInt(match[1]!, 10) : null);
            const loadedPhases = data.phases.map((ph) => ({ ...ph }));
            setName(data.name);
            setPhases(loadedPhases);
            setCommandedPhases(loadedPhases.map((ph) => ({ ...ph })));
            setGlobalStop({ ...data.globalStopConditions });
            setSelectedStepIndex(0);
            sessionStorage.removeItem("elizbeth-profile-edit-initial");
            return;
          }
        }
      } catch {
        // ignore parse errors
      }
      sessionStorage.removeItem("elizbeth-profile-edit-initial");
      const initial = [{ ...defaultPhase }];
      setName("");
      setPhases(initial);
      setCommandedPhases(initial.map((ph) => ({ ...ph })));
      setGlobalStop({ weight: 40 });
      setSelectedStepIndex(0);
      setDeviceSlotIndexToWrite(null);
    }
  }, [profileId, profiles, isLoaded, router]);

  useEffect(() => {
    if (selectedStepIndex >= phases.length) {
      setSelectedStepIndex(Math.max(0, phases.length - 1));
    }
  }, [phases.length, selectedStepIndex]);

  useEffect(() => {
    const el = stepCardRefs.current[selectedStepIndex];
    if (el && carouselRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedStepIndex]);

  const profileForGraph: PhaseProfile = {
    id: profileId ?? "temp",
    name: name || "New Profile",
    phases,
    globalStopConditions: globalStop,
  };

  const [saveStepFeedback, setSaveStepFeedback] = useState(false);
  const saveStep = () => {
    setCommandedPhases(phases.map((p) => ({ ...p })));
    setSaveStepFeedback(true);
  };
  useEffect(() => {
    if (!saveStepFeedback) return;
    const t = setTimeout(() => setSaveStepFeedback(false), 1500);
    return () => clearTimeout(t);
  }, [saveStepFeedback]);

  const handleSave = () => {
    const candidate: PhaseProfile = {
      id: profileId ?? "",
      name: name.trim(),
      phases,
      globalStopConditions: globalStop,
    };
    const errors = validatePhaseProfile(candidate);
    if (errors.length > 0) {
      alert(`Validation:\n${errors.join("\n")}`);
      return;
    }

    // If we're editing a device profile (loaded from sessionStorage with id device-slot-N),
    // persist to ESP via WRITE_PROFILE.
    if (deviceSlotIndexToWrite != null) {
      if (!flowConnected) {
        alert("Not connected to the device WebSocket. Connect to the device, then try Save again.");
        return;
      }
      const profileJson = buildFirmwareProfileJson(candidate);
      const payload = JSON.stringify({
        command: "WRITE_PROFILE",
        index: deviceSlotIndexToWrite,
        profile: profileJson,
      });
      flowSendRaw(payload);
      // Refresh device slots so the UI reflects the saved profile.
      setTimeout(() => flowSendRaw("PROFILES"), 300);
      toast({
        title: "Profile saved to device",
        description: `Saved changes to “${candidate.name || "Profile"}”.`,
        actionLabel: "Go to brew page",
        onAction: () => {
          router.push(`/brew/device-slot-${deviceSlotIndexToWrite}`);
        },
      });
      return;
    }

    if (profileId) {
      updateProfile(profileId, { name: candidate.name, phases: candidate.phases, globalStopConditions: candidate.globalStopConditions });
    } else {
      const created = createProfile({ name: candidate.name, phases: candidate.phases, globalStopConditions: candidate.globalStopConditions });
      selectProfile(created.id);
      router.push(`/profiles/${created.id}`);
    }
  };

  const lastPhase = phases[phases.length - 1];
  const lastPhaseComplete =
    lastPhase != null && phaseStopConditionsToEntries(lastPhase.stopConditions).length > 0;
  const canAddStep = phases.length < 10 && lastPhaseComplete;

  const addStep = () => {
    if (!canAddStep) return;
    const nextPhases = [...phases, { ...defaultPhase }];
    setPhases(nextPhases);
    setSelectedStepIndex(nextPhases.length - 1);
  };

  const removeStep = (index: number) => {
    if (phases.length <= 1) return;
    const next = phases.filter((_, i) => i !== index);
    setPhases(next);
    setCommandedPhases(next.map((p) => ({ ...p })));
    setSelectedStepIndex((prev) => Math.max(0, Math.min(prev, next.length - 1)));
  };

  const updatePhase = (index: number, phase: Phase) => {
    setPhases(phases.map((p, i) => (i === index ? phase : p)));
  };

  const applyAdvancedOverride = () => {
    const result = importGaggiuinoProfile(advancedOverrideJson);
    if (!result.profile) {
      setAdvancedOverrideErrors(result.errors);
      return;
    }

    setName(result.profile.name);
    setPhases(result.profile.phases);
    setCommandedPhases(result.profile.phases.map((phase) => ({ ...phase })));
    setGlobalStop(result.profile.globalStopConditions);
    setSelectedStepIndex(0);
    setAdvancedOverrideErrors([]);
    setAdvancedOverrideOpen(false);
    toast({
      title: "Advanced override imported",
      description: `Loaded ${result.profile.phases.length} phases from pasted JSON.`,
      durationMs: 2500,
    });
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 min-h-screen xl:max-w-6xl">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.push("/")} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={profileId ? "Edit Profile" : "New Profile"}
          className="w-full border-b-2 border-border bg-transparent p-0 text-3xl font-bold outline-none placeholder:text-muted-foreground/50 focus:border-muted-foreground/50"
        />
        <div className="mt-4 rounded-lg border">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setAdvancedOverrideOpen((open) => !open)}
            aria-expanded={advancedOverrideOpen}
          >
            <div>
              <div className="text-sm font-medium">Advanced override</div>
              <div className="text-xs text-muted-foreground">
                Paste raw Gaggiuino profile JSON and convert it into this editor format.
              </div>
            </div>
            <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOverrideOpen && "rotate-180")} />
          </button>
          {advancedOverrideOpen && (
            <div className="space-y-3 border-t px-4 py-4">
              <textarea
                value={advancedOverrideJson}
                onChange={(e) => setAdvancedOverrideJson(e.target.value)}
                placeholder="Paste raw Gaggiuino profile JSON here"
                className="min-h-[220px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {advancedOverrideErrors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <div className="font-medium">Import validation failed</div>
                  <ul className="mt-1 list-disc pl-5">
                    {advancedOverrideErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAdvancedOverrideJson("");
                    setAdvancedOverrideErrors([]);
                  }}
                >
                  Clear
                </Button>
                <Button type="button" onClick={applyAdvancedOverride} disabled={advancedOverrideJson.trim().length === 0}>
                  Import JSON
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step sidebar | Phases carousel + Profile card */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Step sidebar */}
        <div className="space-y-4">
          {saveStepFeedback && (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">Steps saved</p>
          )}
          {phases.length > 0 && selectedStepIndex < phases.length ? (
            <PhaseStepEditor
              key={selectedStepIndex}
              phase={phases[selectedStepIndex]!}
              index={selectedStepIndex}
              onChange={(p) => updatePhase(selectedStepIndex, p)}
              onRemove={() => removeStep(selectedStepIndex)}
              onSaveStep={saveStep}
              canRemove={phases.length > 1}
            />
          ) : (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Select a step or add a step to edit.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Global stop</CardTitle>
            </CardHeader>
            <CardContent>
              <GlobalStopConditionsEditor globalStop={globalStop} onChange={setGlobalStop} />
            </CardContent>
          </Card>
        </div>

        {/* Phases carousel above Profile card */}
        <div className="flex flex-col gap-4 min-w-0">
          <div
            ref={carouselRef}
            className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {phases.map((phase, i) => (
              <StepSummaryCard
                key={i}
                phase={phase}
                index={i}
                selected={selectedStepIndex === i}
                onClick={() => setSelectedStepIndex(i)}
                innerRef={(el) => {
                  stepCardRefs.current[i] = el;
                }}
              />
            ))}
            <AddStepCard onClick={addStep} disabled={!canAddStep} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <PhaseProfileGraph profile={profileForGraph} height={400} inline />
              <div className="mt-3 space-y-1 border-t pt-3 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Phases:</span>
                  <span className="font-medium text-foreground">{phases.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Est. total:</span>
                  <span className="font-medium text-foreground">{calculatePhaseProfileDuration(profileForGraph).toFixed(1)}s</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Profile</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
