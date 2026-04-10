"use client";

import { useState, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import type { PhaseProfile } from "~/types/profiles";
import { calculatePhaseProfileDuration } from "~/lib/profileUtils";

interface ProfileSelectorProps {
  profiles: PhaseProfile[];
  onSelectProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  onStartShot?: (profileId: string) => void;
  isConnected?: boolean;
  isBrewing?: boolean;
  /** When true, hide Edit and Delete buttons (e.g. for device-sourced profiles). */
  readOnly?: boolean;
  /** When provided, Edit button calls this with the profile (e.g. open new page with profile pre-loaded). */
  onEditProfile?: (profile: PhaseProfile) => void;
  /** When true, only render the carousel content without the outer card wrapper. */
  embedded?: boolean;
  /** When true, clicking the card body does nothing. */
  disableCardSelection?: boolean;
  /** Optional per-card action buttons rendered near the footer. */
  renderCardActions?: (profile: PhaseProfile) => ReactNode;
}

export function ProfileSelector({
  profiles,
  onSelectProfile,
  onDeleteProfile,
  onStartShot: _onStartShot,
  isConnected: _isConnected = false,
  isBrewing: _isBrewing = false,
  readOnly = false,
  onEditProfile,
  embedded = false,
  disableCardSelection = false,
  renderCardActions,
}: ProfileSelectorProps) {
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollAmount = 300;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm === id) {
      onDeleteProfile(id);
      setShowDeleteConfirm(null);
    } else {
      setShowDeleteConfirm(id);
    }
  };

  if (profiles.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <div className="text-lg font-semibold">No profiles yet</div>
        <p className="mt-2 text-sm text-muted-foreground">
          {readOnly
            ? "No profiles available."
            : "Create your first profile to start brewing."}
        </p>
        {!readOnly && (
          <div className="mt-4 flex justify-center">
            <Button onClick={() => router.push("/profiles/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create First Profile
            </Button>
          </div>
        )}
      </div>
    );
  }

  const carouselContent = (
    <div className={`relative ${embedded ? "" : "rounded-xl border bg-card"}`}>
      <Button
        variant="outline"
        size="icon"
        className="absolute left-3 top-1/2 z-10 h-8 w-8 -translate-y-1/2 bg-background/90 backdrop-blur-sm"
        onClick={() => scroll("left")}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div
        ref={scrollContainerRef}
        className="flex gap-5 overflow-x-auto px-12 py-6 [&::-webkit-scrollbar]:hidden cursor-default"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onClick={(e) => {
          if (disableCardSelection) {
            return;
          }
          const target = e.target as HTMLElement;
          if (target.closest("button") || target.closest('[role="button"]')) {
            return;
          }
          const card = target.closest("[data-profile-id]");
          if (card) {
            const id = card.getAttribute("data-profile-id");
            if (id) {
              onSelectProfile(id);
            }
          }
        }}
      >
        {profiles.map((profile) => {
          const totalDuration = calculatePhaseProfileDuration(profile);

          return (
            <div
              key={profile.id}
              data-profile-id={profile.id}
              className={`w-[320px] shrink-0 transition-transform duration-300 ease-out ${
                disableCardSelection
                  ? "cursor-default"
                  : "cursor-pointer opacity-90 hover:scale-[1.02] hover:opacity-100"
              }`}
            >
              <Card className="h-full rounded-xl border hover:border-primary/50 hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{profile.name}</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      {(!readOnly || onEditProfile) && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onEditProfile) {
                                onEditProfile(profile);
                              } else {
                                router.push(`/profiles/${profile.id}`);
                              }
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          {!readOnly && profiles.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={(e) => handleDelete(profile.id, e)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div>
                    <PhaseProfileGraph profile={profile} height={180} inline />
                  </div>

                  <div className="space-y-1.5 border-t pt-2 text-sm text-muted-foreground">
                    <div className="flex justify-between gap-3">
                      <span>Phases</span>
                      <span className="text-right font-medium text-foreground">
                        {profile.phases.length}
                      </span>
                    </div>
                    {profile.globalStopConditions.weight != null && (
                      <div className="flex justify-between gap-3">
                        <span>Stop</span>
                        <span className="text-right font-medium text-foreground">
                          at {profile.globalStopConditions.weight}g
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 border-t pt-2">
                      <span>Est. total</span>
                      <span className="text-right font-medium text-foreground">
                        {totalDuration.toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  {renderCardActions ? (
                    <div className="grid gap-2 border-t pt-3">
                      {renderCardActions(profile)}
                    </div>
                  ) : null}

                  {showDeleteConfirm === profile.id && !readOnly && (
                    <div className="mt-2 rounded border border-destructive bg-destructive/10 p-2 text-xs">
                      <div className="mb-1 font-medium text-destructive">
                        Delete this profile?
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProfile(profile.id);
                            setShowDeleteConfirm(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      <Button
        variant="outline"
        size="icon"
        className="absolute right-3 top-1/2 z-10 h-8 w-8 -translate-y-1/2 bg-background/90 backdrop-blur-sm"
        onClick={() => scroll("right")}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  return carouselContent;
}

