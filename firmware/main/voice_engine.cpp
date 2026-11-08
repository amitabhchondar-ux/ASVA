#include "voice_engine.h"
#include <stdio.h>
#include <math.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "audio_i2s.h"

static const char *TAG = "VOICE_ENGINE";
static voice_callback_t s_voice_cb = NULL;
static float s_wake_threshold = 0.80f;
static bool s_is_listening = false;
static int64_t s_listening_start_us = 0;

static void voice_processing_task(void *pvParameters) {
    int16_t audio_chunk[ASVA_AUDIO_CHUNK_SAMPLES];
    size_t samples_read = 0;

    ESP_LOGI(TAG, "ASVA Edge Voice Processing Task started on core 1");

    while (1) {
        if (audio_i2s_read(audio_chunk, ASVA_AUDIO_CHUNK_SAMPLES, &samples_read) == ESP_OK && samples_read > 0) {
            // Audio is processed purely in RAM without flash storage or networking
            // Calculate simple audio energy for VAD (Voice Activity Detection)
            int64_t sum_sq = 0;
            for (size_t i = 0; i < samples_read; i++) {
                sum_sq += (int32_t)audio_chunk[i] * audio_chunk[i];
            }
            float rms = sqrtf((float)sum_sq / samples_read);

            // In full ESP-SR build, WakeNet and MultiNet model feeds run here.
            // Check listening state timeout (5 seconds)
            if (s_is_listening) {
                int64_t now_us = esp_timer_get_time();
                if ((now_us - s_listening_start_us) > 5000000LL) {
                    s_is_listening = false;
                    ESP_LOGI(TAG, "Command listening window timed out. State returned to IDLE.");
                }
            }
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

esp_err_t voice_engine_init(voice_callback_t on_voice_event) {
    s_voice_cb = on_voice_event;
    xTaskCreatePinnedToCore(voice_processing_task, "voice_task", 4096, NULL, 5, NULL, 1);
    ESP_LOGI(TAG, "Voice Engine initialized with threshold %.2f", s_wake_threshold);
    return ESP_OK;
}

void voice_engine_set_threshold(float threshold) {
    if (threshold >= 0.50f && threshold <= 0.99f) {
        s_wake_threshold = threshold;
        ESP_LOGI(TAG, "Sensitivity threshold set to %.2f", s_wake_threshold);
    }
}

float voice_engine_get_threshold(void) {
    return s_wake_threshold;
}

