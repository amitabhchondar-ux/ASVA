#pragma once

#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    VOICE_EVENT_NONE,
    VOICE_EVENT_WAKE,
    VOICE_EVENT_CMD_LIGHT_ON,
    VOICE_EVENT_CMD_LIGHT_OFF,
    VOICE_EVENT_CMD_STATUS
} voice_detected_event_t;

typedef void (*voice_callback_t)(voice_detected_event_t event, float confidence, int latency_ms);

esp_err_t voice_engine_init(voice_callback_t on_voice_event);
void voice_engine_set_threshold(float threshold);
float voice_engine_get_threshold(void);

#ifdef __cplusplus
}
#endif

