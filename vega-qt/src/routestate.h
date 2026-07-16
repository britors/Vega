#pragma once

#include <QSet>
#include <QString>

class RouteLoadState {
public:
    bool beginFirstLoad(const QString &route);
    bool isLoaded(const QString &route) const;
    void invalidate(const QString &route);
    void clear();

private:
    QSet<QString> m_loaded;
};
