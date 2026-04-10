export const getDatasetVisualization = async (req, res) => {
  try {
    const { employee_id, dataset_id } = req.params;

    const data = [
      { date: "2024-01-01", pm25: 120, category: "Urban" },
      { date: "2024-01-02", pm25: 80, category: "Rural" },
      { date: "2024-01-03", pm25: 200, category: "Industrial" },
      { date: "2024-01-04", pm25: 150, category: "Urban" },
      { date: "2024-01-05", pm25: 60, category: "Rural" },
    ];

    res.json({
      employee_id,
      dataset_id,
      data,
    });
  } catch (error) {
    res.status(500).json({ error: "Visualization error" });
  }
};