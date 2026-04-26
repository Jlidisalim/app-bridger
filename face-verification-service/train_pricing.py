"""
Bridger Pricing Model Training Script
======================================
Usage:
  1. Export completed deals from the database:
       SELECT distance_km, weight_kg, category, urgency, price AS agreed_price
       FROM deals
       WHERE status = 'COMPLETED' AND price IS NOT NULL;
     Save as data/deals.csv

  2. Run:  python train_pricing.py

  3. The trained model is saved to /app/models/pricing_model.pkl and
     /app/models/pricing_encoder.pkl — mount this directory in Docker.

Minimum recommended dataset: 500 completed deals.
"""

import os
import sys
import joblib
import pandas as pd
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

try:
    import xgboost as xgb
except ImportError:
    print("ERROR: xgboost not installed. Run: pip install xgboost")
    sys.exit(1)

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "deals.csv")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

print(f"Loading dataset from {DATA_PATH}...")
try:
    df = pd.read_csv(DATA_PATH)
except FileNotFoundError:
    print(f"ERROR: {DATA_PATH} not found.")
    print("Export deals from DB first (see docstring above).")
    sys.exit(1)

REQUIRED_COLS = {"distance_km", "weight_kg", "category", "urgency", "agreed_price"}
missing = REQUIRED_COLS - set(df.columns)
if missing:
    print(f"ERROR: Missing columns in CSV: {missing}")
    sys.exit(1)

# Clean data
df = df.dropna(subset=list(REQUIRED_COLS))
df = df[df["agreed_price"] > 0]
print(f"Dataset: {len(df)} records after cleaning.")

if len(df) < 50:
    print("WARNING: Very small dataset — model quality may be poor. Need 500+ records ideally.")

numeric_features = ["distance_km", "weight_kg"]
categorical_features = ["category", "urgency"]

preprocessor = ColumnTransformer([
    ("num", StandardScaler(), numeric_features),
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
])

pipeline = Pipeline([
    ("prep", preprocessor),
    ("model", xgb.XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )),
])

X = df[numeric_features + categorical_features]
y = df["agreed_price"]

# Cross-validation
print("Running 5-fold cross-validation...")
cv_r2 = cross_val_score(pipeline, X, y, cv=5, scoring="r2")
cv_mae = cross_val_score(pipeline, X, y, cv=5, scoring="neg_mean_absolute_error")

print(f"CV R²  scores: {cv_r2.round(3)} | Mean: {cv_r2.mean():.3f}")
print(f"CV MAE scores: {(-cv_mae).round(2)} | Mean: {(-cv_mae.mean()):.2f}")

# Train on full dataset
pipeline.fit(X, y)

# Save model and encoder separately so the API can load them independently
joblib.dump(pipeline, os.path.join(MODEL_DIR, "pricing_model.pkl"))
# Save the preprocessor separately for the encoder reference in the API
joblib.dump(pipeline.named_steps["prep"], os.path.join(MODEL_DIR, "pricing_encoder.pkl"))

print(f"\n✅ Model saved to {MODEL_DIR}/pricing_model.pkl")
print(f"✅ Encoder saved to {MODEL_DIR}/pricing_encoder.pkl")
print(f"\nModel R²: {cv_r2.mean():.3f} | MAE: {(-cv_mae.mean()):.2f}")
if cv_r2.mean() < 0.7:
    print("⚠️  R² < 0.7 — consider collecting more data before deploying.")
else:
    print("✅ Model quality is acceptable for production.")
