"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import { useProfiles } from "~/hooks/useProfiles";
import { calculatePhaseProfileDuration } from "~/lib/profileUtils";
import type { PhaseProfile } from "~/types/profiles";

function PhaseSummary({ profile }: { profile: PhaseProfile }) {
  const totalSec = calculatePhaseProfileDuration(profile);
  const stopWeight = profile.globalStopConditions.weight;
  return (
    <div className="space-y-1.5 border-t pt-2 text-sm text-muted-foreground">
      <div className="flex justify-between">
        <span>Phases:</span>
        <span className="font-medium text-foreground">{profile.phases.length}</span>
      </div>
      {stopWeight != null && (
        <div className="flex justify-between">
          <span>Stop:</span>
          <span className="font-medium text-foreground">at {stopWeight}g</span>
        </div>
      )}
      <div className="flex justify-between border-t pt-1">
        <span>Est. total:</span>
        <span className="font-medium text-foreground">{totalSec.toFixed(1)}s</span>
      </div>
    </div>
  );
}

export function ProfilesHomePage() {
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { profiles, isLoaded } = useProfiles();

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollAmount = 380;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (!isLoaded) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <p className="text-muted-foreground">Loading profiles…</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Shot Profiles</CardTitle>
            <Button onClick={() => router.push("/profiles/new")} size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              New Profile
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <Button onClick={() => router.push("/profiles/new")} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Create First Profile
            </Button>
          ) : (
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                className="absolute left-0 top-1/2 z-10 h-8 w-8 -translate-y-1/2 bg-background/80 backdrop-blur-sm"
                onClick={() => scroll("left")}
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div
                ref={scrollContainerRef}
                className="flex cursor-default gap-6 overflow-x-auto px-10 py-8 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {profiles.map((profile) => (
                  <div key={profile.id} className="w-[370px] shrink-0">
                    <Card className="h-full border hover:border-primary/50">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{profile.name}</CardTitle>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => router.push(`/profiles/${profile.id}`)}
                            aria-label={`Edit ${profile.name}`}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-0">
                        <div>
                          <PhaseProfileGraph profile={profile} height={180} inline />
                        </div>
                        <PhaseSummary profile={profile} />
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="absolute right-0 top-1/2 z-10 h-8 w-8 -translate-y-1/2 bg-background/80 backdrop-blur-sm"
                onClick={() => scroll("right")}
                aria-label="Scroll right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
