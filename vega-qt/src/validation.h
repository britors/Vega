#pragma once

#include <QString>

namespace Validation {
bool staticIpv4Cidr(const QString &value);
bool username(const QString &value);
bool packageOrigin(const QString &value);
bool backupFrequency(const QString &value);
bool restoreMode(const QString &value);
}
