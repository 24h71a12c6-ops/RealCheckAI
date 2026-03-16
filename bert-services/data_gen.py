import pandas as pd
import random

# Common scam and real patterns
scams = [
    "Urgent: You are selected for Internship! Pay 500 refundable security deposit to confirm.",
    "Congratulations! Get a high paying job without interview. Click this link to register.",
    "Part time work from home. Earn 5000 per day. Send bank details for registration.",
    "Selected for Amazon internship. Pay for training kit immediately.",
    "Direct selection at Google! No interview. Pay processing fee."
] * 40  # 200 samples

real = [
    "We are pleased to invite you for an interview for the Software Engineer intern role.",
    "Your application for Data Analyst position has been received. We will get back to you.",
    "Thank you for applying. Please find the internship offer letter attached.",
    "The technical interview is scheduled for tomorrow at 10 AM on Zoom.",
    "Selected candidates are requested to submit their ID proof for background check."
] * 40  # 200 samples

data = {
    'text': scams + real,
    'label': [1] * 200 + [0] * 200
}

df = pd.DataFrame(data)
df = df.sample(frac=1).reset_index(drop=True) # Shuffle data
df.to_csv('dataset.train.csv', index=False)
print("Done! Now you have 400 rows of training data.")