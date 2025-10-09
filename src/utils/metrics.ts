interface Metric {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

export function writeMetric(
  analytics: CfAnalyticsEngine,
  metric: Metric,
) {
  const { name, value, labels } = metric;

  const data: {
    blobs: (string | undefined)[];
    doubles: number[];
    indexes: string[];
  } = {
    blobs: [name],
    doubles: [value],
    indexes: [],
  };

  if (labels) {
    for (const [key, value] of Object.entries(labels)) {
      data.blobs.push(key);
      data.blobs.push(value);
    }
  }

  analytics.writeDataPoint(data);
}