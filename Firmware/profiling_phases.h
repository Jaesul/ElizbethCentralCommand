/* Ported/adapted from gaggiuino/lib/Common/profiling_phases.h */
#ifndef FLOW_PROFILING_PHASES_H
#define FLOW_PROFILING_PHASES_H

#include "utils.h"
#include "sensors_state.h"
#include <vector>

enum class PHASE_TYPE {
  PHASE_TYPE_FLOW,
  PHASE_TYPE_PRESSURE
};

struct ShotSnapshot {
  uint32_t timeInShot;
  float pressure;
  float pumpFlow;
  float weightFlow;
  float temperature;
  float shotWeight;
  float waterPumped;

  float targetTemperature;
  float targetPumpFlow;
  float targetPressure;
};

struct PhaseStopConditions {
  long time = -1;
  float pressureAbove = -1;
  float pressureBelow = -1;
  float flowAbove = -1;
  float flowBelow = -1;
  float weight = -1;
  float waterPumpedInPhase = -1;

  bool isReached(SensorState& state, long timeInShot, ShotSnapshot stateAtPhaseStart) const;
};

struct Transition {
  float start;
  float end;
  TransitionCurve curve;
  long time;

  Transition() : start(-1), end(-1), curve(TransitionCurve::INSTANT), time(0) {}
  Transition(float targetValue, TransitionCurve curve = TransitionCurve::INSTANT, long time = 0) : start(-1), end(targetValue), curve(curve), time(time) {}
  Transition(float start, float end, TransitionCurve curve = TransitionCurve::LINEAR, long time = 0) : start(start), end(end), curve(curve), time(time) {}

  bool isInstant() const { return curve == TransitionCurve::INSTANT || time == 0; }
};

struct Phase {
  PHASE_TYPE type;
  Transition target;
  float restriction;
  PhaseStopConditions stopConditions;

  float getTarget(uint32_t timeInPhase, const ShotSnapshot& shotSnapshotAtStart) const;
  float getRestriction() const;
  bool isStopConditionReached(SensorState& currentState, uint32_t timeInShot, ShotSnapshot stateAtPhaseStart) const;
};

struct GlobalStopConditions {
  long time = -1;
  float weight = -1;
  float waterPumped = -1;

  bool isReached(const SensorState& state, uint32_t timeInShot);
};

struct Profile {
  std::vector<Phase> phases;
  GlobalStopConditions globalStopConditions;

  size_t phaseCount() const { return phases.size(); }
  void addPhase(const Phase& phase) { phases.push_back(phase); }
  void clear() { phases.clear(); }
};

class CurrentPhase {
private:
  int index;
  const Phase* phase;
  const ShotSnapshot* shotSnapshotAtStart;
  unsigned long timeInPhase;

public:
  CurrentPhase(int index, const Phase& phase, uint32_t timeInPhase, const ShotSnapshot& shotSnapshotAtStart);
  CurrentPhase(const CurrentPhase& currentPhase);

  PHASE_TYPE getType();
  int getIndex();
  long getTimeInPhase();
  float getTarget();
  float getRestriction();
  void update(int index, Phase& phase, uint32_t timeInPhase);
};

class PhaseProfiler {
private:
  Profile& profile;
  size_t currentPhaseIdx = 0;
  ShotSnapshot phaseChangedSnapshot = ShotSnapshot{0, 0, 0, 0, 0, 0, 0, -1, -1, -1};
  CurrentPhase currentPhase;

public:
  PhaseProfiler(Profile& profile);
  void updatePhase(uint32_t timeInShot, SensorState& state);
  CurrentPhase& getCurrentPhase();
  bool isFinished();
  void reset();
  void resetWithCurrentState(const SensorState& stateAtStart);
};

ShotSnapshot buildShotSnapshot(uint32_t timeInShot, const SensorState& state, CurrentPhase& phase);

#endif


