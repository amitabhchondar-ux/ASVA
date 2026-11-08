#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

void actuator_init(void);
void actuator_set_led(bool state);
bool actuator_get_led(void);

#ifdef __cplusplus
}
#endif

