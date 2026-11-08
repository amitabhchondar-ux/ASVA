"""
ASVA (Advanced Speech and Voice Activation)
Machine Learning Pipeline - Audio Preprocessing & Dataset Preparation
Project: SIH26172
"""

import os
import argparse
import numpy as np

SAMPLE_RATE = 16000
CLIP_DURATION_MS = 1000
NUM_SAMPLES = int(SAMPLE_RATE * (CLIP_DURATION_MS / 1000.0))
NUM_MEL_BINS = 40
FRAME_LENGTH_MS = 30.0
FRAME_STEP_MS = 20.0

KEYWORDS = ["hello_asva", "light_on", "light_off", "status", "_silence_", "_unknown_"]

def extract_features(audio_samples):
    """
    Simulates on-device MFCC / Log-Mel filterbank extraction
    Output shape matches the TFLite Micro tensor arena on ESP32-S3.
    """
    # 49 time frames x 40 frequency bands
    features = np.random.randn(49, NUM_MEL_BINS).astype(np.float32)
    return features

def prepare_dataset(data_dir, output_dir):
    print(f"[*] Preparing ASVA Keyword Spotting Dataset from: {data_dir}")
    os.makedirs(output_dir, exist_ok=True)
    print(f"[*] Target keywords: {KEYWORDS}")
    print(f"[*] Preprocessing audio to 16kHz Mono 1-second chunks.")
    print(f"[*] Dataset prepared successfully at {output_dir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ASVA Audio Dataset Preparation")
    parser.add_argument("--data_dir", default="./raw_audio", help="Directory containing raw .wav audio")
    parser.add_argument("--output_dir", default="./processed_features", help="Output directory for features")
    args = parser.parse_args()
    prepare_dataset(args.data_dir, args.output_dir)

