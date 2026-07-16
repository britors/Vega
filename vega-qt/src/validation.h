#pragma once

#include <QString>

namespace Validation {
bool staticIpv4Cidr(const QString &value);
bool username(const QString &value);
}
