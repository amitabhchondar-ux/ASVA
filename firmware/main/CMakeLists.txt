idf_component_register(
    SRCS 
        "app_main.cpp"
        "wifi_manager.cpp"
        "mqtt_link.cpp"
        "audio_i2s.cpp"
        "voice_engine.cpp"
        "actuator.cpp"
    INCLUDE_DIRS "."
    REQUIRES 
        esp_wifi
        nvs_flash
        esp_event
        mqtt
        driver
        esp_timer
)

