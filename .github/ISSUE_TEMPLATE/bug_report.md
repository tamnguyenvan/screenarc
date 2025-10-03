name: Bug Report
description: Create a report to help us improve
title: "[Bug]: "
labels: ["bug", "triage"]
body:
  - type: markdown
    attributes:
      value: "Thanks for taking the time to fill out this bug report!"
  - type: textarea
    id: description
    attributes:
      label: "Describe the bug"
      description: "A clear and concise description of what the bug is."
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: "Steps to Reproduce"
      description: "Steps to reliably reproduce the behavior."
      placeholder: |
        1. Go to '...'
        2. Click on '....'
        3. See error
    validations:
      required: true
  - type: input
    id: os
    attributes:
      label: "Operating System"
      description: "e.g., Windows 11, Ubuntu 22.04, macOS Sonoma"
    validations:
      required: true