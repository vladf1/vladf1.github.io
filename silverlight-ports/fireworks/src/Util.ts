export class Util {
  public static RandomInRange(minVal: number, maxVal: number): number {
    return minVal + Math.random() * (maxVal - minVal);
  }

  public static RandNext(minValue: number, maxValue: number): number {
    return Math.floor(Util.RandomInRange(minValue, maxValue));
  }
}
