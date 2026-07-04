"""
Exovision — 1D-CNN Model Architecture (AstroNet-style)
=====================================================
Implements a dual-branch 1D Convolutional Neural Network in PyTorch.
Designed to ingest two inputs for a single exoplanet target:
  1. Global View (shape: [batch_size, 1, 1000]): Coarse view of the entire orbital period.
     Used to detect eclipsing binary stars, out-of-transit variations, and general noise.
  2. Local View (shape: [batch_size, 1, 200]): Zoomed-in view of the transit region.
     Used to analyze the detailed shape of the transit dip (U-shape vs V-shape).
"""

import torch
import torch.nn as nn


class AstroNetBranch1D(nn.Module):
    """
    Standard convolutional branch for extracting features from 1D light curve views.
    Consists of repeating blocks of Conv1D -> BatchNorm -> ReLU -> MaxPooling.
    """
    def __init__(self, input_len: int, num_filters: list[int] = [16, 32, 64]):
        super().__init__()
        
        layers = []
        in_channels = 1
        
        for filters in num_filters:
            layers.extend([
                nn.Conv1d(in_channels, filters, kernel_size=5, stride=1, padding=2),
                nn.BatchNorm1d(filters),
                nn.ReLU(),
                nn.Conv1d(filters, filters, kernel_size=5, stride=1, padding=2),
                nn.BatchNorm1d(filters),
                nn.ReLU(),
                nn.MaxPool1d(kernel_size=2, stride=2),
                nn.Dropout1d(0.15)
            ])
            in_channels = filters
            
        self.conv_blocks = nn.Sequential(*layers)
        
        # Calculate flat dimension after MaxPool layers
        # Each pool reduces size by factor of 2. We have len(num_filters) pools.
        reduced_len = input_len // (2 ** len(num_filters))
        self.flat_dim = in_channels * reduced_len

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Input shape: (batch_size, 1, input_len)
        x = self.conv_blocks(x)
        # Flatten: (batch_size, flat_dim)
        x = x.view(x.size(0), -1)
        return x


class AstroNet1D(nn.Module):
    """
    Exovision Dual-Branch 1D-CNN Classifier.
    Merges extracted features from both global and local branches, passing
    them through dense layers to predict probability distribution over 3 classes:
      - Class 0: CONFIRMED planet
      - Class 1: CANDIDATE planet
      - Class 2: FALSE POSITIVE
    """
    def __init__(self, global_len: int = 1000, local_len: int = 200, num_classes: int = 3):
        super().__init__()
        
        # Instantiate the two independent feature extractor branches
        self.global_branch = AstroNetBranch1D(input_len=global_len, num_filters=[16, 32, 64])
        self.local_branch = AstroNetBranch1D(input_len=local_len, num_filters=[16, 32, 64])
        
        # Combined flat dimensions from both branches
        combined_dim = self.global_branch.flat_dim + self.local_branch.flat_dim
        
        # Fully connected head
        self.fc_head = nn.Sequential(
            nn.Linear(combined_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(128, num_classes) # Outputs raw logits (CrossEntropyLoss handles Softmax)
        )

    def forward(self, global_view: torch.Tensor, local_view: torch.Tensor) -> torch.Tensor:
        """
        Args:
            global_view: Tensor of shape (batch, 1, 1000)
            local_view: Tensor of shape (batch, 1, 200)
        Returns:
            Logits tensor of shape (batch, 3)
        """
        # Ensure correct dimensions (batch, channels, length)
        if len(global_view.shape) == 2:
            global_view = global_view.unsqueeze(1)
        if len(local_view.shape) == 2:
            local_view = local_view.unsqueeze(1)
            
        global_features = self.global_branch(global_view)
        local_features = self.local_branch(local_view)
        
        # Concatenate extracted features side-by-side
        combined = torch.cat((global_features, local_features), dim=1)
        
        # Classification head
        logits = self.fc_head(combined)
        return logits


if __name__ == "__main__":
    # Quick sanity check: instantiate and pass dummy tensor
    model = AstroNet1D()
    dummy_global = torch.randn(2, 1, 1000)
    dummy_local = torch.randn(2, 1, 200)
    out = model(dummy_global, dummy_local)
    print("Dummy Output Shape:", out.shape) # Expected: [2, 3]
