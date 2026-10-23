// =====================================================================
//  Renew+ Marketing Task Tracker — configuration
// ---------------------------------------------------------------------
//  1. Paste your Firebase web-app config below (see README.md, step 2).
//  2. Put the email(s) of the first admin in BOOTSTRAP_ADMINS.
//     The same email(s) must also be listed in firestore.rules.
//
//  While apiKey still starts with "PASTE", the app runs in DEMO MODE
//  with sample data stored only in your own browser.
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCvnZRMTg_IYWBkCkyTpTEWmjTLHDdKgSI",
  authDomain: "renewplus-tasks.firebaseapp.com",
  projectId: "renewplus-tasks",
  storageBucket: "renewplus-tasks.firebasestorage.app",
  messagingSenderId: "1091222067517",
  appId: "1:1091222067517:web:7eb5fef420734bf3ac8d54"
};

export const BOOTSTRAP_ADMINS = ["sankar@renewgroups.com"];

export const APP_NAME = "Renew+ Marketing Task Tracker";

export const DEFAULT_SETTINGS = {
  branches: ["Head Office"],
  teams: ["Social Media", "SEO", "Performance Ads", "Content & Design", "Video"],
  categories: [
    "Social Media Post",
    "Reel / Video",
    "Google Ads",
    "Meta Ads",
    "SEO",
    "Blog / Content",
    "Graphic Design",
    "Google Business Profile",
    "Reviews & Reputation",
    "Website Update",
    "WhatsApp / Email Campaign",
    "Lead Report",
    "Other",
  ],
};
