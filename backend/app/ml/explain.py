"""
Exovision — Explainability Layer (Gradient Saliency Mapping)
=============================================================
Calculates the gradient of the predicted class score with respect to the input
flux arrays. This tells us which specific regions in the phase-folded light curves
most heavily influenced the model's classification decision.

We output two saliency mapping arrays matching the dimensions of:
  - Global View: shape [1000]
  - Local View: shape [200]
"""

import torch
import numpy as np
from app.ml.model import AstroNet1D


def compute_saliency(
    model: AstroNet1D, 
    global_view: np.ndarray, 
    local_view: np.ndarray
) -> tuple[np.ndarray, np.ndarray, int]:
    """
    Compute gradient saliency map for a single target.
    
    Args:
        model: Trained AstroNet1D model (placed on evaluation mode)
        global_view: 1D numpy array of shape (1000,)
        local_view: 1D numpy array of shape (200,)
        
    Returns:
        Tuple of:
          - global_saliency: 1D numpy array of shape (1000,) containing importance scores
          - local_saliency: 1D numpy array of shape (200,) containing importance scores
          - predicted_class: int representing the winning class index (0, 1, or 2)
    """
    # Set model to evaluation mode
    model.eval()
    
    # Convert inputs to PyTorch tensors and add batch + channel dimensions
    # Shape: [1, 1, length]
    global_tensor = torch.tensor(global_view, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
    local_tensor = torch.tensor(local_view, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
    
    # Enable gradient tracking on input tensors
    global_tensor.requires_grad_()
    local_tensor.requires_grad_()
    
    # Forward pass
    logits = model(global_tensor, local_tensor)
    
    # Find winning class
    probs = torch.softmax(logits, dim=1)
    predicted_class = torch.argmax(probs, dim=1).item()
    
    # Score for the winning class
    score = logits[0, predicted_class]
    
    # Backward pass to calculate gradients on inputs
    score.backward()
    
    # Saliency is the absolute value of the input gradients
    global_saliency = torch.abs(global_tensor.grad).squeeze().cpu().numpy()
    local_saliency = torch.abs(local_tensor.grad).squeeze().cpu().numpy()
    
    # Standardize saliency vectors to range [0, 1] for easier plotting/rendering
    global_max = np.max(global_saliency)
    if global_max > 0:
        global_saliency = global_saliency / global_max
        
    local_max = np.max(local_saliency)
    if local_max > 0:
        local_saliency = local_saliency / local_max
        
    return global_saliency, local_saliency, predicted_class
