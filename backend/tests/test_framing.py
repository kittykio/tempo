import pytest


@pytest.mark.parametrize('path', ['/', '/api/health', '/api/tasks'])
def test_portfolio_framing_policy(anonymous, path):
    response = anonymous.get(path)
    assert response.headers['content-security-policy'] == (
        "frame-ancestors 'self' https://kittykio.com https://www.kittykio.com"
    )
    assert 'x-frame-options' not in response.headers
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert response.headers['referrer-policy'] == 'no-referrer'


def test_embedding_does_not_grant_api_access(anonymous):
    response = anonymous.get('/api/tasks')
    assert response.status_code == 401
    response = anonymous.post(
        '/api/tasks',
        json={'title': 'Should not be created'},
        headers={'Origin': 'https://kittykio.com', 'Sec-Fetch-Site': 'cross-site'},
    )
    assert response.status_code == 403
