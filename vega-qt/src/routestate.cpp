#include "routestate.h"

bool RouteLoadState::beginFirstLoad(const QString &route) {
    if (route.isEmpty() || m_loaded.contains(route)) return false;
    m_loaded.insert(route);
    return true;
}

bool RouteLoadState::isLoaded(const QString &route) const {
    return m_loaded.contains(route);
}

void RouteLoadState::invalidate(const QString &route) {
    m_loaded.remove(route);
}

void RouteLoadState::clear() {
    m_loaded.clear();
}
