#include "audio_i2s.h"
#include "driver/i2s_std.h"
#include "esp_log.h"

static const char *TAG = "AUDIO_I2S";

static const gpio_num_t PIN_I2S_BCLK = GPIO_NUM_4;
static const gpio_num_t PIN_I2S_WS   = GPIO_NUM_5;
static const gpio_num_t PIN_I2S_DIN  = GPIO_NUM_6;

static i2s_chan_handle_t s_rx_handle = NULL;

esp_err_t audio_i2s_init(void) {
    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    ESP_ERROR_CHECK(i2s_new_channel(&chan_cfg, NULL, &s_rx_handle));

    i2s_std_config_t std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(ASVA_AUDIO_SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = PIN_I2S_BCLK,
            .ws = PIN_I2S_WS,
            .dout = I2S_GPIO_UNUSED,
            .din = PIN_I2S_DIN,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    ESP_ERROR_CHECK(i2s_channel_init_std_mode(s_rx_handle, &std_cfg));
    ESP_ERROR_CHECK(i2s_channel_enable(s_rx_handle));

    ESP_LOGI(TAG, "I2S Standard RX channel initialized (16kHz 16-bit Mono, BCLK=%d, WS=%d, DIN=%d)",
             PIN_I2S_BCLK, PIN_I2S_WS, PIN_I2S_DIN);
    return ESP_OK;
}

esp_err_t audio_i2s_read(int16_t *dest, size_t samples_to_read, size_t *samples_read) {
    if (!s_rx_handle) return ESP_ERR_INVALID_STATE;

    size_t bytes_to_read = samples_to_read * sizeof(int16_t);
    size_t bytes_read = 0;

    esp_err_t err = i2s_channel_read(s_rx_handle, dest, bytes_to_read, &bytes_read, portMAX_DELAY);
    if (err == ESP_OK && samples_read) {
        *samples_read = bytes_read / sizeof(int16_t);
    }
    return err;
}

