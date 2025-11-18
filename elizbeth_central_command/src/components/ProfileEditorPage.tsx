"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import { ProfileGraph } from "~/components/ProfileGraph";
import { useProfiles } from "~/hooks/useProfiles";
import type { PressureProfile } from "~/types/profiles";
import { generateProfileData, validateProfile, calculateTotalDuration } from "~/lib/profileUtils";

interface ProfileEditorPageProps {
  profileId?: string;
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

  const handleSliderChange = (values: number[]) => {
    const newValue = values[0]!;
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
            className="w-20 px-2 py-1 text-sm border border-input bg-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleSliderChange}
        className="[&_[data-slot=slider-range]]:bg-[var(--color-profile-orange)] [&_[data-slot=slider-thumb]]:border-[var(--color-profile-orange)] [&_[data-slot=slider-thumb]]:bg-[var(--color-profile-orange)]"
      />
    </div>
  );
}

export function ProfileEditorPage({ profileId }: ProfileEditorPageProps) {
  const router = useRouter();
  const { profiles, isLoaded, createProfile, updateProfile, selectProfile } = useProfiles();
  
  const [name, setName] = useState("");
  const [preInfusion, setPreInfusion] = useState({ duration: 4, pressure: 2 });
  const [ramp, setRamp] = useState({ duration: 5, targetPressure: 9 });
  const [hold, setHold] = useState({ duration: 10, pressure: 9 });
  const [decline, setDecline] = useState({ duration: 7, targetPressure: 6 });
  const [stop, setStop] = useState({ weight: 40 });

  // Load profile if editing
  useEffect(() => {
    if (!isLoaded) return;
    
    if (profileId) {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        setName(profile.name);
        setPreInfusion(profile.preInfusion);
        setRamp(profile.ramp);
        setHold(profile.hold);
        setDecline(profile.decline);
        setStop(profile.stop);
      } else {
        // Profile not found, redirect to home
        router.push("/");
      }
    } else {
      // New profile defaults
      setName("");
      setPreInfusion({ duration: 4, pressure: 2 });
      setRamp({ duration: 5, targetPressure: 9 });
      setHold({ duration: 10, pressure: 9 });
      setDecline({ duration: 7, targetPressure: 6 });
      setStop({ weight: 40 });
    }
  }, [profileId, profiles, isLoaded, router]);

  // Generate graph data in real-time
  const graphData = useMemo(() => {
    const tempProfile: PressureProfile = {
      id: profileId ?? "temp",
      name: name || "New Profile",
      preInfusion,
      ramp,
      hold,
      decline,
      stop,
    };
    return generateProfileData(tempProfile);
  }, [profileId, name, preInfusion, ramp, hold, decline, stop]);

  const handleSave = () => {
    if (!name.trim()) {
      alert("Please enter a profile name");
      return;
    }

    const newProfile: PressureProfile = {
      id: profileId ?? `profile-${Date.now()}-${Math.random().toString(36).substring(7)}`,
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

    if (profileId) {
      updateProfile(profileId, newProfile);
    } else {
      const created = createProfile(newProfile);
      selectProfile(created.id);
    }

    router.push("/");
  };

  const handleCancel = () => {
    router.push("/");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl min-h-screen">
      {/* Header with back button */}
      <div className="mb-6">
        <Button variant="ghost" onClick={handleCancel} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <input
          type="text"
          value={name || ""}
          onChange={(e) => setName(e.target.value)}
          placeholder={profileId ? "Edit Profile" : "New Profile"}
          className="text-3xl font-bold bg-transparent border-none outline-none focus:outline-none focus:ring-0 w-full p-0 placeholder:text-muted-foreground/50 border-b-2 border-transparent focus:border-muted-foreground/30 transition-colors"
        />
      </div>

      {/* Side-by-side layout */}
      <div className="grid grid-cols-1 lg:grid-cols-9 gap-6">
        {/* Left Column - Controls (40%) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Stage Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  max={20}
                  step={0.5}
                  unit="s"
                  onChange={(value) => setPreInfusion({ ...preInfusion, duration: value })}
                />
                <SliderInput
                  label="Pressure"
                  value={preInfusion.pressure}
                  min={0}
                  max={10}
                  step={0.5}
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
                  max={20}
                  step={0.5}
                  unit="s"
                  onChange={(value) => setRamp({ ...ramp, duration: value })}
                />
                <SliderInput
                  label="Target Pressure"
                  value={ramp.targetPressure}
                  min={0}
                  max={10}
                  step={0.5}
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
                  max={20}
                  step={0.5}
                  unit="s"
                  onChange={(value) => setHold({ ...hold, duration: value })}
                />
                <SliderInput
                  label="Pressure"
                  value={hold.pressure}
                  min={0}
                  max={10}
                  step={0.5}
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
                  max={20}
                  step={0.5}
                  unit="s"
                  onChange={(value) => setDecline({ ...decline, duration: value })}
                />
                <SliderInput
                  label="Target Pressure"
                  value={decline.targetPressure}
                  min={0}
                  max={10}
                  step={0.5}
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
                max={80}
                step={0.5}
                unit="g"
                onChange={(value) => setStop({ weight: value })}
              />
            </CardContent>
          </Card>

        </div>

        {/* Right Column - Graph (60%) */}
        <div className="lg:col-span-4">
          <div className="sticky top-4 space-y-4">
            <Card className="w-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Pressure Profile</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <ProfileGraph data={graphData} height={200} inline />
                
                {/* Shot Parameters */}
                <div className="space-y-2 text-sm pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PI:</span>
                    <span className="font-medium">
                      {preInfusion.duration}s @ {preInfusion.pressure} bar
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ramp:</span>
                    <span className="font-medium">
                      to {ramp.targetPressure} bar over {ramp.duration}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hold:</span>
                    <span className="font-medium">
                      {hold.pressure} bar for {hold.duration}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Decline:</span>
                    <span className="font-medium">
                      to {decline.targetPressure} bar over {decline.duration}s
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Stop:</span>
                    <span className="font-medium">
                      at {stop.weight}g | Total: {calculateTotalDuration({ id: "", name: "", preInfusion, ramp, hold, decline, stop }).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Action Buttons - Sticky */}
            <div className="sticky bottom-4 flex justify-end gap-2 pt-4 bg-background pb-4">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save Profile</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

