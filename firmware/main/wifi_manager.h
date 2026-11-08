#pragma once

#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t wifi_manager_init(const char *ssid, const char *password);
bool wifi_manager_is_connected(void);
int wifi_manager_get_rssi(void);

#ifdef __cplusplus
}
#endif

