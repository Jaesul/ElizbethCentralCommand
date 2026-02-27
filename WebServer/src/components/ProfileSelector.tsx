"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2, Edit, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import type { PhaseProfile } from "~/types/profiles";
import { calculatePhaseProfileDuration } from "~/lib/profileUtils";

interface ProfileSelectorProps {
  profiles: PhaseProfile[];
  selectedProfileId: string | null;
  onSelectProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  onStartShot?: (profileId: string) => void;
  isConnected?: boolean;
  isBrewing?: boolean;
  /** When true, hide Edit and Delete buttons (e.g. for device-sourced profiles). */
  readOnly?: boolean;
  /** When provided, Edit button calls this with the profile (e.g. open new page with profile pre-loaded). */
  onEditProfile?: (profile: PhaseProfile) => void;
}

export function ProfileSelector({
  profiles,
  selectedProfileId,
  onSelectProfile,
  onDeleteProfile,
  onStartShot,
  isConnected = false,
  isBrewing = false,
  readOnly = false,
  onEditProfile,
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
      <Card>
        <CardHeader>
          <CardTitle>Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {readOnly ? (
            <p className="text-sm text-muted-foreground">No profiles saved on device.</p>
          ) : (
            <Button onClick={() => router.push("/profiles/new")} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Create First Profile
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Shot Profiles</CardTitle>
          {!readOnly && (
            <Button onClick={() => router.push("/profiles/new")} size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              New Profile
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Left scroll button */}
          <Button
            variant="outline"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Scrollable carousel */}
          <div
            ref={scrollContainerRef}
            className="flex gap-6 overflow-x-auto px-10 py-8 [&::-webkit-scrollbar]:hidden cursor-default"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            onClick={(e) => {
              // Only select profile if clicking on the card itself, not buttons
              const target = e.target as HTMLElement;
              if (target.closest('button') || target.closest('[role="button"]')) {
                return;
              }
              const card = target.closest('[data-profile-id]');
              if (card) {
                const profileId = card.getAttribute('data-profile-id');
                if (profileId) {
                  onSelectProfile(profileId);
                }
              }
            }}
          >
            {profiles.map((profile) => {
              const isSelected = profile.id === selectedProfileId;
              const totalDuration = calculatePhaseProfileDuration(profile);

              return (
                <div
                  key={profile.id}
                  data-profile-id={profile.id}
                  className={`shrink-0 w-[370px] transition-all ${
                    isSelected ? "scale-105" : "opacity-75 hover:opacity-100"
                  }`}
                >
                  <Card
                    className={`h-full ${
                      isSelected
                        ? "border-2 border-primary shadow-md"
                        : "border hover:border-primary/50"
                    }`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{profile.name}</CardTitle>
                          {isSelected && (
                            <Badge variant="default" className="mt-1">
                              Active
                            </Badge>
                          )}
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
                    <CardContent className="pt-0 space-y-4">
                      {/* Profile Graph */}
                      <div>
                        <PhaseProfileGraph profile={profile} height={180} inline />
                      </div>

                      {/* Profile Metrics */}
                      <div className="space-y-1.5 text-sm text-muted-foreground pt-2 border-t">
                        <div className="flex justify-between">
                          <span>Phases:</span>
                          <span className="font-medium text-foreground">{profile.phases.length}</span>
                        </div>
                        {profile.globalStopConditions.weight != null && (
                          <div className="flex justify-between">
                            <span>Stop:</span>
                            <span className="font-medium text-foreground">
                              at {profile.globalStopConditions.weight}g
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t">
                          <span>Est. total:</span>
                          <span className="font-medium text-foreground">{totalDuration.toFixed(1)}s</span>
                        </div>
                      </div>

                      {/* Brew Button */}
                      {onStartShot && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartShot(profile.id);
                          }}
                          disabled={!isConnected || isBrewing}
                          className="w-full"
                          size="sm"
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Brew
                        </Button>
                      )}
                      {showDeleteConfirm === profile.id && !readOnly && (
                        <div className="mt-2 p-2 bg-destructive/10 border border-destructive rounded text-xs">
                          <div className="mb-1 text-destructive font-medium">
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

          {/* Right scroll button */}
          <Button
            variant="outline"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

