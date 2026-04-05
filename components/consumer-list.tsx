// ... other code above 

// Existing code around lines 1500
  const handleUpdateButtonClick = () => {
    if (roleGuardCondition) { // Replace roleGuardCondition with the actual guard condition
      const consumerToEdit = previewConsumer;
      setPreviewConsumer(null);
      setTimeout(() => setSelectedConsumer(consumerToEdit), 0);
      vibrate(); // Presuming vibrate is a function that exists in your context
    }
  };

// ... other code below