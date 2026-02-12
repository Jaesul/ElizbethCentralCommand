/* Ported from gaggiuino/lib/Common/utils.cpp */
#include "utils.h"
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265359
#endif

static float percentageWithTransition(float pct, TransitionCurve transition);

float mapRange(float refNumber, float refStart, float refEnd, float targetStart, float targetEnd, int decimalPrecision, TransitionCurve transition) {
  float deltaRef = refEnd - refStart;
  float deltaTarget = targetEnd - targetStart;

  if (deltaRef == 0) {
    return targetEnd;
  }

  float pct = fmax(0.0f, fmin(1.0f, fabsf((refNumber - refStart) / deltaRef)));
  float finalNumber = targetStart + deltaTarget * percentageWithTransition(pct, transition);

  int calcScale = (int)pow(10, decimalPrecision >= 0 ? decimalPrecision : 1);
  return (float)round(finalNumber * calcScale) / calcScale;
}

static float easeIn(float pct) { return powf(pct, 1.675f); }
static float easeOut(float pct) { return 1.f - powf(1.f - pct, 1.675f); }
static float easeInOut(float pct) { return 0.5f * (sinf((pct - 0.5f) * (float)M_PI) + 1.f); }

static float percentageWithTransition(float pct, TransitionCurve transition) {
  if (transition == TransitionCurve::LINEAR) return pct;
  if (transition == TransitionCurve::EASE_IN) return easeIn(pct);
  if (transition == TransitionCurve::EASE_OUT) return easeOut(pct);
  if (transition == TransitionCurve::INSTANT) return 1.f;
  return easeInOut(pct);
}


