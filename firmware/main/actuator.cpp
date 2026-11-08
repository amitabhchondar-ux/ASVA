#include "actuator.h"
#include "driver/gpio.h"
#include "esp_log.h"

static const char *TAG = "ACTUATOR";
static const gpio_num_t LED_GPIO_PIN = GPIO_NUM_10;
static bool s_led_state = false;

void actuator_init(void) {
    gpio_config_t io_conf = {};
    io_conf.intr_type = GPIO_INTR_DISABLE;
    io_conf.mode = GPIO_MODE_OUTPUT;
    io_conf.pin_bit_mask = (1ULL << LED_GPIO_PIN);
    io_conf.pull_down_en = GPIO_PULLDOWN_DISABLE;
    io_conf.pull_up_en = GPIO_PULLUP_DISABLE;
    gpio_config(&io_conf);

    actuator_set_led(false);
    ESP_LOGI(TAG, "Actuator initialized on GPIO %d", LED_GPIO_PIN);
}

void actuator_set_led(bool state) {
    s_led_state = state;
    gpio_set_level(LED_GPIO_PIN, state ? 1 : 0);
    ESP_LOGI(TAG, "LED state changed to %s", state ? "HIGH (ON)" : "LOW (OFF)");
}

bool actuator_get_led(void) {
    return s_led_state;
}

