/* Ported/adapted from gaggiuino/lib/Common/profiling_phases.cpp */
#include "profiling_phases.h"
#include <math.h>

ShotSnapshot buildShotSnapshot(uint32_t timeInShot, const SensorState& state, CurrentPhase& phase) {
  float targetFlow = (phase.getType() == PHASE_TYPE::PHASE_TYPE_FLOW) ? phase.getTarget() : phase.getRestriction();
  float targetPressure = (phase.getType() == PHASE_TYPE::PHASE_TYPE_PRESSURE) ? phase.getTarget() : phase.getRestriction();

  return ShotSnapshot{
    .timeInShot = timeInShot,
    .pressure = state.smoothedPressure,
    .pumpFlow = state.smoothedPumpFlow,
    .weightFlow = state.smoothedWeightFlow,
    .temperature = state.waterTemperature,
    .shotWeight = state.shotWeight,
    .waterPumped = state.waterPumped,
    .targetTemperature = -1,
    .targetPumpFlow = targetFlow,
    .targetPressure = targetPressure,
  };
}

float Phase::getTarget(uint32_t timeInPhase, const ShotSnapshot& stateAtStart) const {
  long transitionTime = fmax(0L, target.time);
  float startValue = target.start > 0.f ? target.start : (type == PHASE_TYPE::PHASE_TYPE_FLOW ? stateAtStart.pumpFlow : stateAtStart.pressure);
  return mapRange(timeInPhase, 0.f, (float)transitionTime, startValue, target.end, 1, target.curve);
}

float Phase::getRestriction() const { return restriction; }

bool Phase::isStopConditionReached(SensorState& currentState, uint32_t timeInShot, ShotSnapshot stateAtPhaseStart) const {
  return stopConditions.isReached(currentState, (long)timeInShot, stateAtPhaseStart);
}

static inline bool predictTargetAchieved(const float targetValue, const float currentValue, const float changeSpeed, const float reactionTime = 0.f) {
  if (changeSpeed == 0.f) return currentValue == targetValue;
  float remaining = targetValue - currentValue;
  float secondsRemaining = remaining / changeSpeed;
  return secondsRemaining < reactionTime;
}

bool PhaseStopConditions::isReached(SensorState& state, long timeInShot, ShotSnapshot stateAtPhaseStart) const {
  uint32_t timeInPhase = (uint32_t)(timeInShot - (long)stateAtPhaseStart.timeInShot);
  float flow = state.weight > 0.4f ? state.smoothedWeightFlow : state.smoothedPumpFlow;
  float currentWaterPumpedInPhase = state.waterPumped - stateAtPhaseStart.waterPumped;

  return (time >= 0L && timeInPhase >= (uint32_t)time) ||
    (weight > 0.f && state.shotWeight > weight) ||
    (pressureAbove > 0.f && state.smoothedPressure > pressureAbove) ||
    (pressureBelow > 0.f && state.smoothedPressure < pressureBelow) ||
    (waterPumpedInPhase > 0.f && currentWaterPumpedInPhase >= waterPumpedInPhase) ||
    (flowAbove > 0.f && flow > flowAbove) ||
    (flowBelow > 0.f && flow < flowBelow);
}

bool GlobalStopConditions::isReached(const SensorState& state, uint32_t timeInShot) {
  if (timeInShot < 1000) return false;
  float flow = state.weight > 0.4f ? state.smoothedWeightFlow : state.smoothedPumpFlow;

  return (weight > 0.f && predictTargetAchieved(weight, state.shotWeight, flow, 0.5f)) ||
    (waterPumped > 0.f && state.waterPumped > waterPumped) ||
    (time > 0L && timeInShot >= (uint32_t)time);
}

CurrentPhase::CurrentPhase(int index, const Phase& phase, uint32_t timeInPhase, const ShotSnapshot& shotSnapshotAtStart)
  : index(index), phase(&phase), shotSnapshotAtStart(&shotSnapshotAtStart), timeInPhase(timeInPhase) {}

CurrentPhase::CurrentPhase(const CurrentPhase& currentPhase)
  : index(currentPhase.index), phase(currentPhase.phase), shotSnapshotAtStart(currentPhase.shotSnapshotAtStart), timeInPhase(currentPhase.timeInPhase) {}

PHASE_TYPE CurrentPhase::getType() { return phase->type; }
int CurrentPhase::getIndex() { return index; }
long CurrentPhase::getTimeInPhase() { return (long)timeInPhase; }
float CurrentPhase::getTarget() { return phase->getTarget(timeInPhase, *shotSnapshotAtStart); }
float CurrentPhase::getRestriction() { return phase->getRestriction(); }

void CurrentPhase::update(int index, Phase& phase, uint32_t timeInPhase) {
  this->index = index;
  this->phase = &phase;
  this->timeInPhase = timeInPhase;
}

PhaseProfiler::PhaseProfiler(Profile& profile) : profile(profile), currentPhase(0, profile.phases[0], 0, phaseChangedSnapshot) {}

void PhaseProfiler::updatePhase(uint32_t timeInShot, SensorState& state) {
  size_t phaseIdx = currentPhaseIdx;
  uint32_t timeInPhase = timeInShot - phaseChangedSnapshot.timeInShot;

  if (phaseIdx >= profile.phaseCount() || profile.globalStopConditions.isReached(state, timeInShot)) {
    currentPhaseIdx = profile.phaseCount();
    if (profile.phaseCount() > 0) {
      size_t lastIdx = profile.phaseCount() - 1;
      currentPhase.update((int)lastIdx, profile.phases[lastIdx], timeInPhase);
    }
    return;
  }

  if (!profile.phases[phaseIdx].isStopConditionReached(state, timeInShot, phaseChangedSnapshot)) {
    currentPhase.update((int)phaseIdx, profile.phases[phaseIdx], timeInPhase);
    return;
  }

  currentPhase.update((int)phaseIdx, profile.phases[phaseIdx], timeInPhase);
  phaseChangedSnapshot = buildShotSnapshot(timeInShot, state, currentPhase);
  currentPhaseIdx += 1;
  updatePhase(timeInShot, state);
}

CurrentPhase& PhaseProfiler::getCurrentPhase() { return currentPhase; }
bool PhaseProfiler::isFinished() { return currentPhaseIdx >= profile.phaseCount(); }

void PhaseProfiler::reset() {
  currentPhaseIdx = 0;
  phaseChangedSnapshot = ShotSnapshot{0, 0, 0, 0, 0, 0, 0, -1, -1, -1};
  if (profile.phaseCount() > 0) {
    currentPhase.update(0, profile.phases[0], 0);
  }
}

void PhaseProfiler::resetWithCurrentState(const SensorState& stateAtStart) {
  reset();
  // Prime the "state at phase start" snapshot with CURRENT measured values so:
  // - Transition start:-1 ramps from current pressure/flow instead of from 0
  // - Stop conditions don't accidentally compare against a dummy 0 snapshot
  if (profile.phaseCount() == 0) return;
  phaseChangedSnapshot = buildShotSnapshot(0, stateAtStart, currentPhase);
}


