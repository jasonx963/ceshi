export default async function handler(req, res) {
  res.status(200).json({
    has_url: !!process.env.KV_REST_API_URL,
    has_token: !!process.env.KV_REST_API_TOKEN,
    admin_token_set: !!process.env.ADMIN_TOKEN
  });
}
