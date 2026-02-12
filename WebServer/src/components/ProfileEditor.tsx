"use client";

import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { ProfileGraph } from "~/components/ProfileGraph";
import type { PressureProfile } from "~/types/profiles";
import { generateProfileData, validateProfile } from "~/lib/profileUtils";

interface ProfileEditorProps {
  profile: PressureProfile | null;
  onSave: (profile: PressureProfile) => void;
  onCancel: () => void;
}

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

function SliderInput({ label, value, min, max, step = 0.1, unit = "", onChange }: SliderInputProps) {
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    onChange(newValue);
    setInputValue(newValue.toString());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const numValue = parseFloat(e.target.value);
    if (!isNaN(numValue) && numValue >= min && numValue <= max) {
      onChange(numValue);
    }
  };

  const handleInputBlur = () => {
    const numValue = parseFloat(inputValue);
    if (isNaN(numValue) || numValue < min) {
      onChange(min);
      setInputValue(min.toString());
    } else if (numValue > max) {
      onChange(max);
      setInputValue(max.toString());
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            className="w-20 px-2 py-1 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSliderChange}
        className="w-full"
      />
    </div>
  );
}

export function ProfileEditor({ profile, onSave, onCancel }: ProfileEditorProps) {
  const [name, setName] = useState("");
  const [preInfusion, setPreInfusion] = useState({ duration: 4, pressure: 2 });
  const [ramp, setRamp] = useState({ duration: 5, targetPressure: 9 });
  const [hold, setHold] = useState({ duration: 10, pressure: 9 });
  const [decline, setDecline] = useState({ duration: 7, targetPressure: 6 });
  const [stop, setStop] = useState({ weight: 40 });

  // Initialize from profile prop
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPreInfusion(profile.preInfusion);
      setRamp(profile.ramp);
      setHold(profile.hold);
      setDecline(profile.decline);
      setStop(profile.stop);
    } else {
      // New profile defaults
      setName("");
      setPreInfusion({ duration: 4, pressure: 2 });
      setRamp({ duration: 5, targetPressure: 9 });
      setHold({ duration: 10, pressure: 9 });
      setDecline({ duration: 7, targetPressure: 6 });
      setStop({ weight: 40 });
    }
  }, [profile]);

  // Generate graph data in real-time
  const graphData = useMemo(() => {
    const tempProfile: PressureProfile = {
      id: profile?.id ?? "temp",
      name: name || "New Profile",
      preInfusion,
      ramp,
      hold,
      decline,
      stop,
    };
    return generateProfileData(tempProfile);
  }, [profile?.id, name, preInfusion, ramp, hold, decline, stop]);

  const handleSave = () => {
    if (!name.trim()) {
      alert("Please enter a profile name");
      return;
    }

    const newProfile: PressureProfile = {
      id: profile?.id ?? `profile-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: name.trim(),
      preInfusion,
      ramp,
      hold,
      decline,
      stop,
    };

    const errors = validateProfile(newProfile);
    if (errors.length > 0) {
      alert(`Validation errors:\n${errors.join("\n")}`);
      return;
    }

    onSave(newProfile);
  };

  if (!profile && name === "") {
    // Show empty state for new profile
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>{profile ? "Edit Profile" : "New Profile"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Profile Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter profile name"
              className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Real-time Graph */}
          <div>
            <ProfileGraph data={graphData} height={250} />
          </div>

          {/* Stage Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pre-infusion */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pre-infusion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SliderInput
                  label="Duration"
                  value={preInfusion.duration}
                  min={0}
                  max={60}
                  step={0.5}
                  unit="s"
                  onChange={(value) => setPreInfusion({ ...preInfusion, duration: value })}
                />
                <SliderInput
                  label="Pressure"
                  value={preInfusion.pressure}
                  min={0}
                  max={15}
                  step={0.1}
                  unit="bar"
                  onChange={(value) => setPreInfusion({ ...preInfusion, pressure: value })}
                />
              </CardContent>
            </Card>

            {/* Ramp */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ramp</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SliderInput
                  label="Duration"
                  value={ramp.duration}
                  min={0}
                  max={30}
                  step={0.5}
                  unit="s"
                  onChange={(value) => setRamp({ ...ramp, duration: value })}
                />
                <SliderInput
                  label="Target Pressure"
                  value={ramp.targetPressure}
                  min={0}
                  max={15}
                  step={0.1}
                  unit="bar"
                  onChange={(value) => setRamp({ ...ramp, targetPressure: value })}
                />
              </CardContent>
            </Card>

            {/* Hold */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Hold</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SliderInput
                  label="Duration"
                  value={hold.duration}
                  min={0}
                  max={120}
                  step={0.5}
                  unit="s"
                  onChange={(value) => setHold({ ...hold, duration: value })}
                />
                <SliderInput
                  label="Pressure"
                  value={hold.pressure}
                  min={0}
                  max={15}
                  step={0.1}
                  unit="bar"
                  onChange={(value) => setHold({ ...hold, pressure: value })}
                />
              </CardContent>
            </Card>

            {/* Decline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Decline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SliderInput
                  label="Duration"
                  value={decline.duration}
                  min={0}
                  max={30}
                  step={0.5}
                  unit="s"
                  onChange={(value) => setDecline({ ...decline, duration: value })}
                />
                <SliderInput
                  label="Target Pressure"
                  value={decline.targetPressure}
                  min={0}
                  max={15}
                  step={0.1}
                  unit="bar"
                  onChange={(value) => setDecline({ ...decline, targetPressure: value })}
                />
              </CardContent>
            </Card>
          </div>

          {/* Stop Condition */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Stop Condition</CardTitle>
            </CardHeader>
            <CardContent>
              <SliderInput
                label="Weight"
                value={stop.weight}
                min={10}
                max={200}
                step={1}
                unit="g"
                onChange={(value) => setStop({ weight: value })}
              />
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Profile</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

