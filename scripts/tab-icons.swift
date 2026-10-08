// Draws the Camera tab's icons (ui/assets/tabs/): Apple's own camera symbols in Mahi blue
// (COLORS.accent in ui/src/constants/tokens.ts). Apple's tab bar tints every unselected tab alike,
// so a blue Camera tab needs a ready-made image (owner, 2026-10-08). If the accent changes, redraw:
//   for s in 1 2 3; do x=$([ $s = 1 ] && echo "" || echo "@${s}x")
//     swift scripts/tab-icons.swift camera 20 '#59C2D7' $s ui/assets/tabs/camera$x.png 36 28
//     swift scripts/tab-icons.swift camera.fill 25 '#59C2D7' $s ui/assets/tabs/camera-selected$x.png 36 28
//   done
import AppKit
// args: symbol pointSize hex scale out [canvasWidthPt canvasHeightPt]
// Both Camera images are drawn on the same canvas, so the bar's layout never changes between the
// unselected (smaller) and selected (larger) picture (2026-10-08: the labels dropped out of line).
let a = CommandLine.arguments
let name = a[1]; let pt = CGFloat(Double(a[2])!); let hex = a[3]; let scale = CGFloat(Double(a[4])!); let out = a[5]
let canvas: CGSize? = a.count >= 8 ? CGSize(width: CGFloat(Double(a[6])!) * scale, height: CGFloat(Double(a[7])!) * scale) : nil
func color(_ h: String) -> NSColor {
  var v: UInt64 = 0; Scanner(string: String(h.dropFirst())).scanHexInt64(&v)
  return NSColor(srgbRed: CGFloat((v>>16)&255)/255, green: CGFloat((v>>8)&255)/255, blue: CGFloat(v&255)/255, alpha: 1)
}
let cfg = NSImage.SymbolConfiguration(pointSize: pt * scale, weight: .regular)
  .applying(NSImage.SymbolConfiguration(paletteColors: [color(hex)]))
guard let img = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(cfg) else { print("no symbol"); exit(1) }
let size = canvas ?? img.size
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(ceil(size.width)), pixelsHigh: Int(ceil(size.height)), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let origin = NSPoint(x: (size.width - img.size.width) / 2, y: (size.height - img.size.height) / 2)
img.draw(in: NSRect(origin: origin, size: img.size))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print(out, Int(size.width), Int(size.height))
