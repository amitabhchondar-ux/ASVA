#pragma once

#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*command_callback_t)(const char *cmd, const char *param, const char *cmd_id);

esp_err_t mqtt_link_init(const char *broker_uri, const char *device_id, command_callback_t on_cmd);
esp_err_t mqtt_link_publish_status(bool led, uint32_t heap, int rssi, uint32_t uptime, float threshold);
esp_err_t mqtt_link_publish_event(const char *kind, const char *text, float conf, int latency_ms);
esp_err_t mqtt_link_publish_ack(const char *cmd_id, bool ok, const char *error_msg);

#ifdef __cplusplus
}
#endif

