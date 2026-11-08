#include <stdio.h>
#include <string.h>
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "actuator.h"
#include "audio_i2s.h"
#include "wifi_manager.h"
#include "mqtt_link.h"
#include "voice_engine.h"

static const char *TAG = "ASVA_MAIN";
static const char *DEVICE_ID = "asva-esp32-01";
static const char *HUB_MQTT_BROKER = "mqtt://192.168.1.50:1883";
static uint32_t s_uptime_seconds = 0;

static void on_command_received(const char *cmd, const char *param, const char *cmd_id) {
    ESP_LOGI(TAG, "Command received: cmd='%s', param='%s', id='%s'", cmd, param, cmd_id);

    if (strcmp(cmd, "led") == 0) {
        bool turn_on = (strcmp(param, "on") == 0);
        actuator_set_led(turn_on);
        mqtt_link_publish_ack(cmd_id, true, NULL);
        mqtt_link_publish_status(turn_on, esp_get_free_heap_size(), wifi_manager_get_rssi(), s_uptime_seconds, voice_engine_get_threshold());
    } else if (strcmp(cmd, "threshold") == 0) {
        float val = 0.80f;
        sscanf(param, "%f", &val);
        voice_engine_set_threshold(val);
        mqtt_link_publish_ack(cmd_id, true, NULL);
        mqtt_link_publish_status(actuator_get_led(), esp_get_free_heap_size(), wifi_manager_get_rssi(), s_uptime_seconds, voice_engine_get_threshold());
    } else if (strcmp(cmd, "status") == 0) {
        mqtt_link_publish_ack(cmd_id, true, NULL);
        mqtt_link_publish_status(actuator_get_led(), esp_get_free_heap_size(), wifi_manager_get_rssi(), s_uptime_seconds, voice_engine_get_threshold());
    } else {
        mqtt_link_publish_ack(cmd_id, false, "unknown command");
    }
}

static void on_voice_detected(voice_detected_event_t event, float confidence, int latency_ms) {
    if (event == VOICE_EVENT_WAKE) {
        ESP_LOGI(TAG, "Voice Wake: 'Hello ASVA' detected! (conf: %.2f, latency: %d ms)", confidence, latency_ms);
        mqtt_link_publish_event("wake", "Hello ASVA", confidence, latency_ms);
    } else if (event == VOICE_EVENT_CMD_LIGHT_ON) {
        ESP_LOGI(TAG, "Voice Command: 'Light on' detected! (conf: %.2f, latency: %d ms)", confidence, latency_ms);
        actuator_set_led(true);
        mqtt_link_publish_event("command", "Light on", confidence, latency_ms);
        mqtt_link_publish_status(true, esp_get_free_heap_size(), wifi_manager_get_rssi(), s_uptime_seconds, voice_engine_get_threshold());
    } else if (event == VOICE_EVENT_CMD_LIGHT_OFF) {
        ESP_LOGI(TAG, "Voice Command: 'Light off' detected! (conf: %.2f, latency: %d ms)", confidence, latency_ms);
        actuator_set_led(false);
        mqtt_link_publish_event("command", "Light off", confidence, latency_ms);
        mqtt_link_publish_status(false, esp_get_free_heap_size(), wifi_manager_get_rssi(), s_uptime_seconds, voice_engine_get_threshold());
    } else if (event == VOICE_EVENT_CMD_STATUS) {
        ESP_LOGI(TAG, "Voice Command: 'Status' detected! (conf: %.2f, latency: %d ms)", confidence, latency_ms);
        mqtt_link_publish_event("command", "Status", confidence, latency_ms);
        mqtt_link_publish_status(actuator_get_led(), esp_get_free_heap_size(), wifi_manager_get_rssi(), s_uptime_seconds, voice_engine_get_threshold());
    }
}

extern "C" void app_main(void) {
    ESP_LOGI(TAG, "=== ASVA Edge Node Starting (SIH26172) ===");

    // Initialize NVS Flash
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Initialize Actuator (GPIO 10)
    actuator_init();

    // Initialize I2S Audio Capture (GPIO 4, 5, 6)
    audio_i2s_init();

    // Initialize Voice Recognition Engine
    voice_engine_init(on_voice_detected);

    // Initialize Wi-Fi
    wifi_manager_init("ASVA-Lab-WiFi", "LocalNetworkOnly");

    // Initialize MQTT Link with Hub
    mqtt_link_init(HUB_MQTT_BROKER, DEVICE_ID, on_command_received);

    // Main telemetry heartbeat loop (Every 10 seconds per FW-4)
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(10000));
        s_uptime_seconds += 10;
        uint32_t free_heap = esp_get_free_heap_size();
        int rssi = wifi_manager_get_rssi();
        bool led_state = actuator_get_led();
        float thresh = voice_engine_get_threshold();

        mqtt_link_publish_status(led_state, free_heap, rssi, s_uptime_seconds, thresh);
        ESP_LOGI(TAG, "[HEARTBEAT] Uptime: %lu s, Free Heap: %lu B, RSSI: %d dBm, LED: %s",
                 (unsigned long)s_uptime_seconds, (unsigned long)free_heap, rssi, led_state ? "ON" : "OFF");
    }
}

