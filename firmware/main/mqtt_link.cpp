#include "mqtt_link.h"
#include <stdio.h>
#include <string.h>
#include "esp_log.h"
#include "mqtt_client.h"
#include "cJSON.h"

static const char *TAG = "MQTT_LINK";
static esp_mqtt_client_handle_t s_client = NULL;
static char s_device_id[32] = "asva-esp32-01";
static char s_topic_online[64];
static char s_topic_status[64];
static char s_topic_event[64];
static char s_topic_cmd[64];
static char s_topic_ack[64];
static command_callback_t s_on_cmd = NULL;

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;
    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED:
        ESP_LOGI(TAG, "MQTT connected to broker.");
        // Publish retained online presence
        esp_mqtt_client_publish(s_client, s_topic_online, "online", 6, 1, 1);
        // Subscribe to command topic
        esp_mqtt_client_subscribe(s_client, s_topic_cmd, 0);
        ESP_LOGI(TAG, "Subscribed to %s", s_topic_cmd);
        break;

    case MQTT_EVENT_DISCONNECTED:
        ESP_LOGW(TAG, "MQTT disconnected from broker.");
        break;

    case MQTT_EVENT_DATA: {
        ESP_LOGI(TAG, "MQTT message received on %.*s: %.*s",
                 event->topic_len, event->topic, event->data_len, event->data);
        if (s_on_cmd && strncmp(event->topic, s_topic_cmd, event->topic_len) == 0) {
            char buffer[256];
            int len = event->data_len < 255 ? event->data_len : 255;
            memcpy(buffer, event->data, len);
            buffer[len] = '\0';

            cJSON *root = cJSON_Parse(buffer);
            if (root) {
                cJSON *id_item = cJSON_GetObjectItem(root, "id");
                cJSON *cmd_item = cJSON_GetObjectItem(root, "cmd");
                const char *cmd_id = id_item ? id_item->valuestring : "unknown";
                const char *cmd_str = cmd_item ? cmd_item->valuestring : "";

                cJSON *state_item = cJSON_GetObjectItem(root, "state");
                const char *param_str = state_item ? state_item->valuestring : "";

                s_on_cmd(cmd_str, param_str, cmd_id);
                cJSON_Delete(root);
            }
        }
        break;
    }
    default:
        break;
    }
}

esp_err_t mqtt_link_init(const char *broker_uri, const char *device_id, command_callback_t on_cmd) {
    strncpy(s_device_id, device_id, sizeof(s_device_id) - 1);
    s_on_cmd = on_cmd;

    snprintf(s_topic_online, sizeof(s_topic_online), "asva/%s/online", s_device_id);
    snprintf(s_topic_status, sizeof(s_topic_status), "asva/%s/status", s_device_id);
    snprintf(s_topic_event,  sizeof(s_topic_event),  "asva/%s/event",  s_device_id);
    snprintf(s_topic_cmd,    sizeof(s_topic_cmd),    "asva/%s/cmd",    s_device_id);
    snprintf(s_topic_ack,    sizeof(s_topic_ack),    "asva/%s/ack",    s_device_id);

    esp_mqtt_client_config_t mqtt_cfg = {};
    mqtt_cfg.broker.address.uri = broker_uri;
    // Set LWT (Last-Will-and-Testament)
    mqtt_cfg.session.last_will.topic = s_topic_online;
    mqtt_cfg.session.last_will.msg = "offline";
    mqtt_cfg.session.last_will.msg_len = 7;
    mqtt_cfg.session.last_will.qos = 1;
    mqtt_cfg.session.last_will.retain = 1;

    s_client = esp_mqtt_client_init(&mqtt_cfg);
    esp_mqtt_client_register_event(s_client, MQTT_EVENT_ANY, mqtt_event_handler, NULL);
    return esp_mqtt_client_start(s_client);
}

esp_err_t mqtt_link_publish_status(bool led, uint32_t heap, int rssi, uint32_t uptime, float threshold) {
    if (!s_client) return ESP_ERR_INVALID_STATE;

    char payload[180];
    snprintf(payload, sizeof(payload),
             "{\"led\":%s,\"heap\":%lu,\"rssi\":%d,\"uptime\":%lu,\"fw\":\"1.0.0-IDF5\",\"threshold\":%.2f}",
             led ? "true" : "false", (unsigned long)heap, rssi, (unsigned long)uptime, threshold);

    return esp_mqtt_client_publish(s_client, s_topic_status, payload, 0, 0, 1) != -1 ? ESP_OK : ESP_FAIL;
}

esp_err_t mqtt_link_publish_event(const char *kind, const char *text, float conf, int latency_ms) {
    if (!s_client) return ESP_ERR_INVALID_STATE;

    char payload[160];
    snprintf(payload, sizeof(payload),
             "{\"kind\":\"%s\",\"text\":\"%s\",\"conf\":%.2f,\"latency_ms\":%d}",
             kind, text, conf, latency_ms);

    return esp_mqtt_client_publish(s_client, s_topic_event, payload, 0, 0, 0) != -1 ? ESP_OK : ESP_FAIL;
}

esp_err_t mqtt_link_publish_ack(const char *cmd_id, bool ok, const char *error_msg) {
    if (!s_client) return ESP_ERR_INVALID_STATE;

    char payload[128];
    if (ok) {
        snprintf(payload, sizeof(payload), "{\"id\":\"%s\",\"ok\":true}", cmd_id);
    } else {
        snprintf(payload, sizeof(payload), "{\"id\":\"%s\",\"ok\":false,\"error\":\"%s\"}", cmd_id, error_msg ? error_msg : "error");
    }

    return esp_mqtt_client_publish(s_client, s_topic_ack, payload, 0, 0, 0) != -1 ? ESP_OK : ESP_FAIL;
}

