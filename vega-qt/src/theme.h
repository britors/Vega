#pragma once

#include <QPalette>
#include <QString>

namespace VegaTheme {
enum class DesktopScheme { Unknown, Light, Dark };

QPalette palette(const QString &theme, const QPalette &systemPalette,
                 DesktopScheme desktopScheme = DesktopScheme::Unknown);
double contrastRatio(const QColor &foreground, const QColor &background);
}
