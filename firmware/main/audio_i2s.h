#pragma once

#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define ASVA_AUDIO_SAMPLE_RATE     16000
#define ASVA_AUDIO_BITS_PER_SAMPLE 16
#define ASVA_AUDIO_CHANNELS        1
#define ASVA_AUDIO_CHUNK_SAMPLES   512

esp_err_t audio_i2s_init(void);
esp_err_t audio_i2s_read(int16_t *dest, size_t samples_to_read, size_t *samples_read);

#ifdef __cplusplus
}
#endif

