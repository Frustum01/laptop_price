export const getVisualization = async (req, res) => {
  try {
    res.json({ message: "Dashboard visualization working" });
  } catch (error) {
    res.status(500).json({ error: "Visualization error" });
  }
};

export const getDatasetVisualization = async (req, res) => {
  try {
    const { employee_id, dataset_id } = req.params;

    const data = [
      { date: "2024-01-01", pm25: 120 },
      { date: "2024-01-02", pm25: 80 },
      { date: "2024-01-03", pm25: 200 },
    ];

    res.json({
      employee_id,
      dataset_id,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Visualization error" });
  }
};